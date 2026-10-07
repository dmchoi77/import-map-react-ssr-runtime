import { fileURLToPath } from 'node:url';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig, type Plugin } from 'vite';

import { useImportMapReactModules } from './vite-import-map-react';

const remoteSpecifier = '@example/tanstack-start/remote';
const remoteEntry = fileURLToPath(new URL('../remote/src/remote-app.tsx', import.meta.url));

export default defineConfig(({ command }) => {
  const remoteOrigin =
    process.env.REMOTE_ORIGIN ??
    (command === 'serve'
      ? `http://${process.env.REMOTE_HOST ?? '127.0.0.1'}:${process.env.REMOTE_PORT ?? 5231}`
      : '');
  const remoteClientEntry = remoteOrigin
    ? `${remoteOrigin}/src/remote-app.tsx`
    : '/remote/remote.mjs';
  const remoteResolver: Plugin = {
    name: 'example-tanstack-start-host-remote',
    enforce: 'pre',
    resolveId(source, _importer, options) {
      if (source !== remoteSpecifier) return;
      if (options?.ssr) return remoteEntry;
      return { id: remoteClientEntry, external: true };
    },
  };

  return {
    define: {
      'import.meta.env.VITE_REMOTE_ENTRY': JSON.stringify(remoteClientEntry),
    },
    plugins: [
      remoteResolver,
      useImportMapReactModules(),
      tanstackStart({ srcDirectory: 'src' }),
      react(),
      nitro(),
    ],
    server: {
      host: process.env.HOST ?? '127.0.0.1',
      port: Number(process.env.PORT ?? 5230),
      strictPort: true,
    },
  };
});
