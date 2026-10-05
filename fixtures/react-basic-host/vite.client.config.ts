import { defineConfig } from 'vite';

import { useImportMapReactModules } from '../vite-import-map-plugin';

export default defineConfig({
  plugins: [useImportMapReactModules()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/app.client.tsx',
      external: ['@mfe/basic/counter', 'react', 'react-dom/client', 'react/jsx-runtime'],
      output: {
        entryFileNames: 'app.client.mjs',
        chunkFileNames: 'assets/[name]-[hash].mjs',
      },
    },
  },
});
