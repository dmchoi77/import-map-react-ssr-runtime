import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

import { createFixtureMiddleware } from './server.mjs';
import { useImportMapReactModules } from '../vite-import-map-plugin';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
const remoteOrigin =
  process.env.REMOTE_ORIGIN ??
  `http://${process.env.REMOTE_HOST ?? '127.0.0.1'}:${process.env.REMOTE_PORT ?? 5174}`;

const remoteEntryPaths = new Map([
  ['@mfe/fixture/counter', '/fixtures/react-remote/src/counter.server.tsx'],
  ['@mfe/fixture/profile', '/fixtures/react-remote/src/profile.server.tsx'],
  ['@mfe/fixture/dashboard', '/fixtures/react-remote/src/dashboard.server.tsx'],
]);

const nestedRemoteModules = new Map([
  [
    '@mfe/fixture/counter',
    fileURLToPath(new URL('../react-remote/src/counter.server.tsx', import.meta.url)),
  ],
  [
    '@mfe/fixture/profile',
    fileURLToPath(new URL('../react-remote/src/profile.server.tsx', import.meta.url)),
  ],
]);

export default defineConfig({
  root: workspaceRoot,
  plugins: [
    useImportMapReactModules(),
    {
      name: 'fixture-host-ssr',
      enforce: 'pre',
      resolveId(source, _importer, options) {
        if (!options?.ssr) return;
        return nestedRemoteModules.get(source);
      },
      configureServer(server) {
        server.middlewares.use(
          createFixtureMiddleware({
            loadHostApp: () => server.ssrLoadModule('/fixtures/react-host/src/app.server.tsx'),
            loadRemote: (specifier) => {
              const entryPath = remoteEntryPaths.get(specifier);
              if (!entryPath) throw new Error(`Unknown fixture remote: ${specifier}`);
              return server.ssrLoadModule(entryPath);
            },
            bootstrapPath: '/packages/react/dist/bootstrap.mjs',
            clientPath: (remoteName) => new URL(`/src/${remoteName}.client.tsx`, remoteOrigin).href,
          }),
        );
      },
    },
  ],
  server: {
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 5173),
    strictPort: true,
  },
});
