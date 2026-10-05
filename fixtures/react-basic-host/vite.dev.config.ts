import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

import { createBasicMiddleware } from './server.mjs';
import { useImportMapReactModules } from '../vite-import-map-plugin';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
const remoteOrigin =
  process.env.REMOTE_ORIGIN ??
  `http://${process.env.REMOTE_HOST ?? '127.0.0.1'}:${process.env.REMOTE_PORT ?? 5174}`;
const remoteEntry = fileURLToPath(
  new URL('../react-basic-remote/src/counter.server.tsx', import.meta.url),
);

export default defineConfig({
  root: workspaceRoot,
  plugins: [
    useImportMapReactModules(),
    {
      name: 'basic-react-fixture-host',
      enforce: 'pre',
      resolveId(source, _importer, options) {
        if (options?.ssr && source === '@mfe/basic/counter') return remoteEntry;
      },
      configureServer(server) {
        server.middlewares.use(
          createBasicMiddleware({
            loadHostApp: () =>
              server.ssrLoadModule('/fixtures/react-basic-host/src/app.server.tsx'),
            loadRemote: (specifier) => {
              if (specifier !== '@mfe/basic/counter')
                throw new Error(`Unknown remote: ${specifier}`);
              return server.ssrLoadModule('/fixtures/react-basic-remote/src/counter.server.tsx');
            },
            bootstrapPath: '/packages/react/dist/bootstrap.mjs',
            clientPath: () => new URL('/src/counter.client.tsx', remoteOrigin).href,
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
