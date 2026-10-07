import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';

import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import {
  createBrowserImportMap,
  createModulePreloadLinks,
  serializeImportMap,
} from '@mfe-ssr/import-map';
import { registerNodeLoader } from '@mfe-ssr/node';
import remoteManifest, { createBrowserManifest } from '../../remote/manifest.mjs';

registerNodeLoader(remoteManifest, {
  baseUrl: new URL('../../remote/', import.meta.url).href,
});

const REMOTE_SPECIFIER = '@example/react-vite/remote';
const DEFAULT_CLIENT_PATH = '/app/client.mjs';
const DEFAULT_REMOTE_CLIENT_PATH = '/remote/remote.mjs';
const DEFAULT_HOST_APP_MODULE = '../dist/server/app.server.mjs';

export function createReactViteMiddleware({
  loadHostApp = () => import(/* @vite-ignore */ DEFAULT_HOST_APP_MODULE),
  clientPath = DEFAULT_CLIENT_PATH,
  remoteClientPath = DEFAULT_REMOTE_CLIENT_PATH,
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
      const body = renderToString(createElement(HostApp));
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(
        renderDocument({
          origin: requestUrl.origin,
          documentUrl: requestUrl.href,
          body,
          clientPath,
          remoteClientPath,
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

export async function createReactViteServer({
  httpServer = createServer(),
  host = '127.0.0.1',
  port = 0,
} = {}) {
  const runtimeFiles = await createRuntimeFiles();
  const middleware = createReactViteMiddleware({ runtimeFiles });
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
  await addDirectoryFiles(runtimeFiles, new URL('../dist/client/', import.meta.url), '/app');
  await addDirectoryFiles(runtimeFiles, new URL('../../remote/dist/', import.meta.url), '/remote');
  return runtimeFiles;
}

async function addDirectoryFiles(runtimeFiles, directoryUrl, urlPrefix) {
  for (const filename of await readdir(directoryUrl, { recursive: true })) {
    if (!filename.endsWith('.mjs')) continue;
    const relativeFilename = filename.replaceAll('\\', '/');
    runtimeFiles.set(`${urlPrefix}/${relativeFilename}`, new URL(relativeFilename, directoryUrl));
  }
}

function renderDocument({ origin, documentUrl, body, clientPath, remoteClientPath }) {
  const browserManifest = createBrowserManifest(origin, new URL(remoteClientPath, origin).href);
  const importMap = createBrowserImportMap(browserManifest);
  importMap.imports.react = 'https://esm.sh/react@19.3.0';
  importMap.imports['react/jsx-runtime'] = 'https://esm.sh/react@19.3.0/jsx-runtime';
  importMap.imports['react-dom/client'] = 'https://esm.sh/react-dom@19.3.0/client?external=react';
  const preloadLinks = createModulePreloadLinks(browserManifest, [REMOTE_SPECIFIER], {
    documentUrl,
    parentUrl: new URL(clientPath, documentUrl).href,
  });

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>React Vite MFE SSR Example</title>
    <script type="importmap">${serializeImportMap(importMap)}</script>
    ${preloadLinks}
  </head>
  <body>
    <main><div id="app-root">${body}</div></main>
    <script type="module" src="${clientPath}"></script>
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
