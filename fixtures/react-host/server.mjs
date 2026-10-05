import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import { createBrowserImportMap, serializeImportMap } from '@mfe-ssr/import-map';
import { renderReactRemote, renderReactRemoteBySpecifierToStream } from '@mfe-ssr/react/server';

import { createClientManifest } from '../react-remote/manifest.mjs';

export function createFixtureMiddleware({
  loadHostApp = () => import('./dist/server/app.server.mjs'),
  loadRemote = (specifier) => import(specifier),
  bootstrapPath = '/runtime/react/bootstrap.mjs',
  clientPath,
  runtimeFiles = new Map(),
  streamRemoteDelayMs = 0,
} = {}) {
  return async (request, response, next) => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

    try {
      if (requestUrl.pathname === '/stream' || requestUrl.pathname === '/stream-failure') {
        const { HostApp } = await loadHostApp();
        await renderStreamPage({
          response,
          loadRemote,
          origin: requestUrl.origin,
          HostApp,
          bootstrapPath,
          clientPath,
          streamRemoteDelayMs,
          failure: requestUrl.pathname === '/stream-failure',
        });
        return;
      }

      if (requestUrl.pathname === '/' || requestUrl.pathname === '/failure') {
        const { HostApp } = await loadHostApp();
        const pageOptions = {
          loadRemote,
          origin: requestUrl.origin,
          HostApp,
          bootstrapPath,
          clientPath,
        };
        const page =
          requestUrl.pathname === '/failure'
            ? await renderFailurePage(pageOptions)
            : await renderHomePage(pageOptions);
        send(response, 200, 'text/html; charset=utf-8', page);
        return;
      }

      const fileUrl = runtimeFiles.get(requestUrl.pathname);
      if (fileUrl) {
        const source = await readFile(fileUrl, 'utf8');
        send(response, 200, 'text/javascript; charset=utf-8', source);
        return;
      }

      next();
    } catch (error) {
      if (response.headersSent) {
        if (!response.destroyed) response.destroy(error instanceof Error ? error : undefined);
      } else {
        send(
          response,
          500,
          'text/plain; charset=utf-8',
          error instanceof Error ? error.message : error,
        );
      }
    }
  };
}

export async function createFixtureServer({
  httpServer = createServer(),
  host = '127.0.0.1',
  port = 0,
  serveBuiltAssets = true,
  ...middlewareOptions
} = {}) {
  const runtimeFiles = await createRuntimeFiles({ serveBuiltAssets });
  const middleware = createFixtureMiddleware({ ...middlewareOptions, runtimeFiles });
  httpServer.on('request', (request, response) => {
    middleware(request, response, () =>
      send(response, 404, 'text/plain; charset=utf-8', 'Not found'),
    );
  });

  await listen(httpServer, port, host);

  return {
    origin: `http://${host}:${httpServer.address().port}`,
    server: httpServer,
    close: () => close(httpServer),
  };
}

async function createRuntimeFiles({ serveBuiltAssets }) {
  const runtimeFiles = new Map();

  if (serveBuiltAssets) {
    await addDirectoryFiles(
      runtimeFiles,
      new URL('../../packages/react/dist/', import.meta.url),
      '/runtime/react',
    );
    await addDirectoryFiles(
      runtimeFiles,
      new URL('../react-remote/dist/client/', import.meta.url),
      '/remote',
    );
  }

  return runtimeFiles;
}

async function addDirectoryFiles(runtimeFiles, directoryUrl, urlPrefix) {
  for (const filename of await readdir(directoryUrl, { recursive: true })) {
    if (!filename.endsWith('.mjs')) continue;

    const relativeFilename = filename.replaceAll('\\', '/');
    runtimeFiles.set(`${urlPrefix}/${relativeFilename}`, new URL(relativeFilename, directoryUrl));
  }
}

async function renderHomePage({ loadRemote, origin, HostApp, bootstrapPath, clientPath }) {
  const counterProps = { label: 'Counter', state: { count: 0 } };
  const profileProps = { name: 'Ada Lovelace' };
  const counter = await loadRemote('@mfe/fixture/counter');
  const profile = await loadRemote('@mfe/fixture/profile');
  const counterHtml = renderReactRemote({
    specifier: '@mfe/fixture/counter',
    remote: counter,
    props: counterProps,
    rootId: 'counter-root',
    identifierPrefix: 'counter-',
  });
  const profileHtml = renderReactRemote({
    specifier: '@mfe/fixture/profile',
    remote: profile,
    props: profileProps,
    rootId: 'profile-root',
    identifierPrefix: 'profile-',
  });

  return renderDocument({
    origin,
    page: 'home',
    HostApp,
    bootstrapPath,
    clientPath,
    body: [counterHtml, profileHtml].join(''),
  });
}

async function renderFailurePage({ loadRemote, origin, HostApp, bootstrapPath, clientPath }) {
  try {
    await loadRemote('@mfe/fixture/missing');
  } catch {
    return renderDocument({
      origin,
      page: 'failure',
      HostApp,
      bootstrapPath,
      clientPath,
      body: '<div id="failure-root" data-mfe-fallback="server"><p>Remote unavailable</p></div>',
    });
  }

  throw new Error('The failure fixture unexpectedly loaded its remote.');
}

async function renderStreamPage({
  response,
  loadRemote,
  origin,
  HostApp,
  bootstrapPath,
  clientPath,
  streamRemoteDelayMs,
  failure,
}) {
  const controller = new AbortController();
  const abortOnDisconnect = () => {
    if (!response.writableEnded) controller.abort();
  };
  response.once('close', abortOnDisconnect);
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });

  async function* documentChunks() {
    yield renderDocumentStart({
      origin,
      page: 'stream',
      HostApp,
      clientPath,
    });

    try {
      const specifier = failure ? '@mfe/fixture/missing' : '@mfe/fixture/counter';
      const remoteStream = renderReactRemoteBySpecifierToStream({
        specifier,
        props: { label: 'Counter', state: { count: 0 } },
        rootId: 'counter-root',
        identifierPrefix: 'counter-',
        fallback: 'Loading remote',
        errorFallback: 'Remote unavailable',
        timeoutMs: Math.max(1_000, streamRemoteDelayMs + 1_000),
        signal: controller.signal,
        loadRemote: async (remoteSpecifier, { signal }) => {
          if (streamRemoteDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, streamRemoteDelayMs));
          }
          if (signal?.aborted) throw createAbortError();
          return loadRemote(remoteSpecifier, { signal });
        },
      });
      for await (const chunk of remoteStream) yield chunk;
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw error;
    }

    yield renderDocumentEnd(bootstrapPath);
  }

  try {
    await pipeline(Readable.from(documentChunks()), response);
  } finally {
    response.off('close', abortOnDisconnect);
  }
}

function renderDocument({ origin, page, body, HostApp, bootstrapPath, clientPath }) {
  return `${renderDocumentStart({ origin, page, HostApp, clientPath })}${body}${renderDocumentEnd(bootstrapPath)}`;
}

function renderDocumentStart({ origin, page, HostApp, clientPath }) {
  const importMap = createBrowserImportMap(createClientManifest(origin, clientPath));
  importMap.imports.react = 'https://esm.sh/react@19.3.0';
  importMap.imports['react/jsx-runtime'] = 'https://esm.sh/react@19.3.0/jsx-runtime';
  importMap.imports['react-dom/client'] = 'https://esm.sh/react-dom@19.3.0/client?external=react';

  const hostApp = renderToString(createElement(HostApp, { page }));

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>React SSR Fixture</title>
    <script type="importmap">${serializeImportMap(importMap)}</script>
  </head>
  <body data-mfe-page="${page}">
    <main><div id="host-app-root">${hostApp}</div>`;
}

function renderDocumentEnd(bootstrapPath) {
  return `</main>
    <script type="module" src="${bootstrapPath}"></script>
  </body>
</html>`;
}

function createAbortError() {
  const error = new Error('The streamed response was aborted.');
  error.name = 'AbortError';
  return error;
}

function send(response, status, contentType, body) {
  response.writeHead(status, { 'content-type': contentType });
  response.end(body);
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function start() {
  const fixture = await createFixtureServer({
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 4173),
    streamRemoteDelayMs: Number(process.env.STREAM_REMOTE_DELAY_MS ?? 180),
  });
  console.log(`READY ${fixture.origin}`);

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await fixture.close();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void start();
}
