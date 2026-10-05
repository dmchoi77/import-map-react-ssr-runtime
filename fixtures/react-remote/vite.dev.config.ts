import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

import { useImportMapReactModules } from '../vite-import-map-plugin';

export default defineConfig({
  plugins: [useImportMapReactModules()],
  resolve: {
    alias: [
      {
        find: './nested-remote-loader',
        replacement: fileURLToPath(
          new URL('./src/nested-remote-loader.client.ts', import.meta.url),
        ),
      },
    ],
  },
  server: {
    host: process.env.REMOTE_HOST ?? '127.0.0.1',
    port: Number(process.env.REMOTE_PORT ?? 5174),
    strictPort: true,
  },
});
