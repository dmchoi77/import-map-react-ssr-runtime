import { defineConfig } from 'vite';

import { useImportMapReactModules } from '../vite-import-map-plugin';

export default defineConfig({
  plugins: [useImportMapReactModules()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/counter.client.tsx',
      preserveEntrySignatures: 'strict',
      external: ['react', 'react/jsx-runtime'],
      output: {
        entryFileNames: 'counter.client.mjs',
        chunkFileNames: 'assets/[name]-[hash].mjs',
      },
    },
  },
});
