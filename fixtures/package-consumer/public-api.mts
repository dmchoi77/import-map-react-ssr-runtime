import '@mfe-ssr/react/bootstrap';

import { createElement } from 'react';
import {
  ManifestError,
  createManifestResolver,
  type RemoteManifest,
  validateManifest,
} from '@mfe-ssr/core';
import {
  createBrowserImportMap,
  createImportMapScript,
  createModulePreloadLinks,
  injectImportMap,
  serializeImportMap,
} from '@mfe-ssr/import-map';
import {
  RemoteModuleFetcher,
  createNodeResolver,
  registerNodeLoader,
  type RemoteModuleCacheOptions,
  type NodeLoaderData,
  type NodeLoaderOptions,
  type RemoteModuleErrorCode,
} from '@mfe-ssr/node';
import { initialize, load, resolve } from '@mfe-ssr/node/loader';
import { renderReactRemote, type ReactRemoteModule } from '@mfe-ssr/react';
import {
  renderReactRemote as renderReactRemoteFromServer,
  renderReactRemoteBySpecifierToStream,
  renderReactRemoteToStream,
} from '@mfe-ssr/react/server';

const manifest = {
  imports: {
    '@mfe/consumer': {
      id: '@mfe/consumer',
      version: '1.0.0',
      client: 'https://cdn.example.com/consumer/client.mjs',
      server: './remotes/consumer/server.mjs',
    },
  },
} satisfies RemoteManifest;

validateManifest(manifest);
const resolver = createManifestResolver(manifest, 'server');
const serverUrl: string | undefined = resolver.resolve('@mfe/consumer');
const importMap = createBrowserImportMap(manifest);
const serializedMap: string = serializeImportMap(importMap);
const importMapScript: string = createImportMapScript(manifest);
const modulePreloadLinks: string = createModulePreloadLinks(manifest, ['@mfe/consumer'], {
  documentUrl: 'https://consumer.example.com/',
});
const injectedScript: HTMLScriptElement = injectImportMap(document, manifest);
const nodeResolver = createNodeResolver(manifest, { baseUrl: 'file:///consumer/' });
const nodeUrl: string | undefined = nodeResolver('@mfe/consumer');
const cacheOptions: RemoteModuleCacheOptions = {
  directory: '/tmp/mfe-remote-cache',
  ttlMs: 60_000,
  maxSizeBytes: 16 * 1024 * 1024,
  staleWhileRevalidateMs: 0,
};
const nodeOptions: NodeLoaderOptions = {
  allowedOrigins: ['https://cdn.example.com'],
  cache: cacheOptions,
};
const loaderData: NodeLoaderData = { manifest, options: nodeOptions };
const fetcher = new RemoteModuleFetcher(nodeOptions);
const verifiedModule: Promise<string> = fetcher.fetch(
  'https://cdn.example.com/consumer/server.mjs',
  'sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
);
const integrityErrorCode: RemoteModuleErrorCode = 'REMOTE_INTEGRITY_MISMATCH';
registerNodeLoader(manifest, nodeOptions);
initialize(loaderData);
void resolve(
  '@mfe/consumer',
  {
    conditions: [],
    importAttributes: {},
    parentURL: 'file:///consumer/host.mjs',
  },
  async (specifier) => ({ url: specifier }),
);
void load(
  'file:///consumer/remote.mjs',
  { conditions: [], format: 'module', importAttributes: {} },
  async (url) => ({ format: 'module', source: `export default ${JSON.stringify(url)}` }),
);

interface ConsumerProps {
  count: number;
}

const remote: ReactRemoteModule<ConsumerProps> = {
  default: ({ count }) => createElement('p', null, count),
};
const html: string = renderReactRemote({
  specifier: '@mfe/consumer',
  remote,
  props: { count: 2 },
});
const serverHtml: string = renderReactRemoteFromServer({
  specifier: '@mfe/consumer',
  remote,
  props: { count: 2 },
});
const streamedHtml: AsyncIterable<Uint8Array> = renderReactRemoteToStream({
  specifier: '@mfe/consumer',
  remote,
  props: { count: 2 },
});
const specifierStream: AsyncIterable<Uint8Array> = renderReactRemoteBySpecifierToStream({
  specifier: '@mfe/consumer',
  props: { count: 2 },
  loadRemote: async () => remote,
  timeoutMs: 1_000,
});

// @ts-expect-error React remote props are checked against the component contract.
renderReactRemote({ specifier: '@mfe/consumer', remote, props: { name: 'wrong shape' } });

void [
  ManifestError,
  serverUrl,
  serializedMap,
  importMapScript,
  modulePreloadLinks,
  injectedScript,
  nodeUrl,
  verifiedModule,
  integrityErrorCode,
  cacheOptions,
  html,
  serverHtml,
  streamedHtml,
  specifierStream,
];
