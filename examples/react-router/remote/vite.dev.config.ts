import { defineConfig } from 'vite';

import { useImportMapReactModules } from './vite-import-map-react';

export default defineConfig({
  plugins: [useImportMapReactModules()],
  server: {
    host: process.env.REMOTE_HOST ?? '127.0.0.1',
    port: Number(process.env.REMOTE_PORT ?? 5221),
    strictPort: true,
  },
});
