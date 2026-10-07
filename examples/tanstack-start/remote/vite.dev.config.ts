import { defineConfig } from 'vite';

import { useImportMapReactModules } from './vite-import-map-react';

export default defineConfig({
  plugins: [useImportMapReactModules()],
  server: {
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 5231),
    strictPort: true,
  },
});
