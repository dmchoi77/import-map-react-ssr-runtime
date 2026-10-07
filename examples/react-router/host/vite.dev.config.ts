import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

import { createReactRouterMiddleware } from './server.mjs';
import { useImportMapReactModules } from './vite-import-map-react';

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const remoteOrigin =
  process.env.REMOTE_ORIGIN ??
  `http://${process.env.REMOTE_HOST ?? '127.0.0.1'}:${process.env.REMOTE_PORT ?? 5221}`;
const remoteEntry = fileURLToPath(new URL('../remote/src/remote-app.tsx', import.meta.url));

export default defineConfig({
  root: workspaceRoot,
  plugins: [
    useImportMapReactModules(),
    {
      name: 'example-react-router-host-remote',
      enforce: 'pre',
      resolveId(source, _importer, options) {
        if (source !== '@example/react-router/remote') return;
        if (options?.ssr) return remoteEntry;
        return { id: `${remoteOrigin}/src/remote-app.tsx`, external: true };
      },
      configureServer(server) {
        server.middlewares.use(
          createReactRouterMiddleware({
            loadHostApp: () =>
              server.ssrLoadModule('/examples/react-router/host/src/app.server.tsx'),
            clientPath: '/examples/react-router/host/src/app.client.tsx',
            remoteClientPath: `${remoteOrigin}/src/remote-app.tsx`,
          }),
        );
      },
    },
  ],
  server: {
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 5220),
    strictPort: true,
  },
});
