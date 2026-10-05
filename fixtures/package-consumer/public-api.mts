import {
  ManifestError,
  createManifestResolver,
  type DiagnosticEvent,
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
  checkRemoteHealth,
  createNodeResolver,
  registerNodeLoader,
  type NodeLoaderData,
  type NodeLoaderOptions,
  type RemoteHealthResult,
  type RemoteModuleCacheOptions,
  type RemoteModuleErrorCode,
} from '@mfe-ssr/node';
import { initialize, load, resolve } from '@mfe-ssr/node/loader';
import {
  withNextRemoteEntries,
  type NextIntegrationOptions,
  type NextRemoteEntry,
} from '@mfe-ssr/next';

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
const nextEntry: NextRemoteEntry = {
  client: 'https://cdn.example.com/consumer/client.mjs',
  server: './remotes/consumer/server.mjs',
};
const nextOptions: NextIntegrationOptions = { entries: { '@mfe/consumer': nextEntry } };
const nextConfig = withNextRemoteEntries({ reactStrictMode: true }, nextOptions);
const cacheOptions: RemoteModuleCacheOptions = {
  directory: '/tmp/mfe-remote-cache',
  ttlMs: 60_000,
  maxSizeBytes: 16 * 1024 * 1024,
  staleWhileRevalidateMs: 0,
};
const nodeOptions: NodeLoaderOptions = {
  allowedOrigins: ['https://cdn.example.com'],
  cache: cacheOptions,
  onDiagnostic: (event: DiagnosticEvent) => void event.phase,
};
const loaderData: NodeLoaderData = { manifest, options: nodeOptions };
const fetcher = new RemoteModuleFetcher(nodeOptions);
const verifiedModule: Promise<string> = fetcher.fetch(
  'https://cdn.example.com/consumer/server.mjs',
  'sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
);
const integrityErrorCode: RemoteModuleErrorCode = 'REMOTE_INTEGRITY_MISMATCH';
registerNodeLoader(manifest, nodeOptions);
const healthResults: Promise<RemoteHealthResult[]> = checkRemoteHealth(manifest, {
  allowedOrigins: ['https://cdn.example.com'],
  onDiagnostic: (event) => void event.phase,
});
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
  healthResults,
  nextConfig,
];
