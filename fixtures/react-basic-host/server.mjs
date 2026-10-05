import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import {
  createBrowserImportMap,
  createModulePreloadLinks,
  serializeImportMap,
} from '@mfe-ssr/import-map';
import { renderReactRemoteBySpecifier } from '@mfe-ssr/react/server';

import { createClientManifest } from '../react-basic-remote/manifest.mjs';

const REMOTE_SPECIFIER = '@mfe/basic/counter';
const DEFAULT_BOOTSTRAP_PATH = '/runtime/react/bootstrap.mjs';

export function createBasicMiddleware({
  loadHostApp = () => import('./dist/server/app.server.mjs'),
  loadRemote = (specifier) => import(specifier),
  bootstrapPath = DEFAULT_BOOTSTRAP_PATH,
  clientPath,
  runtimeFiles = new Map(),
} = {}) {
  return async (request, response, next) => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

    try {
      const runtimeFile = runtimeFiles.get(requestUrl.pathname);
      if (runtimeFile) {
        response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
        response.end(await readFile(runtimeFile, 'utf8'));
        return;
      }

      if (requestUrl.pathname !== '/') {
        next();
        return;
      }

      const { HostApp } = await loadHostApp();
      const remoteMarkup = await renderReactRemoteBySpecifier({
        specifier: REMOTE_SPECIFIER,
        props: { initial: 0 },
        rootId: 'counter-root',
        loadRemote,
      });
      const body = `${renderToString(createElement(HostApp))}${remoteMarkup}`;
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(
        renderDocument({
          origin: requestUrl.origin,
          documentUrl: requestUrl.href,
          body,
          bootstrapPath,
          clientPath,
        }),
      );
    } catch (error) {
      if (!response.headersSent) {
        response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        response.end(error instanceof Error ? error.message : String(error));
      } else if (!response.destroyed) {
        response.destroy(error instanceof Error ? error : undefined);
      }
    }
  };
}

export async function createBasicServer({
  httpServer = createServer(),
  host = '127.0.0.1',
  port = 0,
} = {}) {
  const runtimeFiles = await createRuntimeFiles();
  const middleware = createBasicMiddleware({ runtimeFiles });
  httpServer.on('request', (request, response) =>
    middleware(request, response, () =>
      send(response, 404, 'text/plain; charset=utf-8', 'Not found'),
    ),
  );
  await listen(httpServer, port, host);

  return {
    origin: `http://${host}:${httpServer.address().port}`,
    server: httpServer,
    close: () => close(httpServer),
  };
}

async function createRuntimeFiles() {
  const runtimeFiles = new Map();
  await addDirectoryFiles(
    runtimeFiles,
    new URL('../../packages/react/dist/', import.meta.url),
    '/runtime/react',
  );
  await addDirectoryFiles(
    runtimeFiles,
    new URL('../react-basic-remote/dist/client/', import.meta.url),
    '/remote',
  );
  return runtimeFiles;
}

async function addDirectoryFiles(runtimeFiles, directoryUrl, urlPrefix) {
  for (const filename of await readdir(directoryUrl, { recursive: true })) {
    if (!filename.endsWith('.mjs')) continue;
    const relativeFilename = filename.replaceAll('\\', '/');
    runtimeFiles.set(`${urlPrefix}/${relativeFilename}`, new URL(relativeFilename, directoryUrl));
  }
}

function renderDocument({ origin, documentUrl, body, bootstrapPath, clientPath }) {
  const clientEntry = typeof clientPath === 'function' ? clientPath() : clientPath;
  const manifest = createClientManifest(origin, clientEntry);
  const importMap = createBrowserImportMap(manifest);
  importMap.imports.react = 'https://esm.sh/react@19.3.0';
  importMap.imports['react/jsx-runtime'] = 'https://esm.sh/react@19.3.0/jsx-runtime';
  importMap.imports['react-dom/client'] = 'https://esm.sh/react-dom@19.3.0/client?external=react';
  const preloadLinks = createModulePreloadLinks(manifest, [REMOTE_SPECIFIER], {
    documentUrl,
    parentUrl: new URL(bootstrapPath, documentUrl).href,
  });

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>React SSR Basic Fixture</title>
    <script type="importmap">${serializeImportMap(importMap)}</script>
    ${preloadLinks}
  </head>
  <body>
    <main>${body}</main>
    <script type="module" src="${bootstrapPath}"></script>
  </body>
</html>`;
}

function send(response, status, contentType, body) {
  response.writeHead(status, { 'content-type': contentType });
  response.end(body);
}

function listen(server, port, host) {
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolvePromise);
  });
}

function close(server) {
  return new Promise((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()));
  });
}

async function start() {
  const fixture = await createBasicServer({
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 4173),
  });
  console.log(`READY ${fixture.origin}`);

  const shutdown = () => void fixture.close();
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void start();
}
