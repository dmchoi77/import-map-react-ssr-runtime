import { defineConfig } from 'vite';

import { useImportMapReactModules } from './vite-import-map-react';

export default defineConfig({
  plugins: [useImportMapReactModules()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/remote-app.tsx',
      preserveEntrySignatures: 'strict',
      external: ['react', 'react/jsx-runtime'],
      output: {
        entryFileNames: 'remote.mjs',
        chunkFileNames: 'assets/[name]-[hash].mjs',
      },
    },
  },
});
