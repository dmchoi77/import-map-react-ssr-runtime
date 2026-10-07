import { defineConfig } from 'vite';

import { useImportMapReactModules } from './vite-import-map-react';

export default defineConfig({
  plugins: [useImportMapReactModules()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/app.client.tsx',
      external: ['@example/react-vite/remote', 'react', 'react-dom/client', 'react/jsx-runtime'],
      output: {
        entryFileNames: 'client.mjs',
        chunkFileNames: 'assets/[name]-[hash].mjs',
      },
    },
  },
});
