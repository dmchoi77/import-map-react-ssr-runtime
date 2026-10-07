import { defineConfig } from 'vite';

import { useImportMapReactModules } from './vite-import-map-react';

export default defineConfig({
  plugins: [useImportMapReactModules()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/remote-app.tsx',
      external: ['react', 'react/jsx-runtime'],
      preserveEntrySignatures: 'strict',
      output: {
        entryFileNames: 'remote.mjs',
        chunkFileNames: 'assets/[name]-[hash].mjs',
      },
    },
  },
});
