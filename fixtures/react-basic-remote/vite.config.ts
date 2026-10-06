import { defineConfig } from 'vite';

import { useImportMapReactModules } from '../vite-import-map-plugin';

export default defineConfig({
  plugins: [useImportMapReactModules()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        counter: 'src/remote-counter.tsx',
        badge: 'src/remote-badge.tsx',
      },
      preserveEntrySignatures: 'strict',
      external: ['@mfe/basic/badge', 'react', 'react/jsx-runtime'],
      output: {
        entryFileNames: '[name].mjs',
        chunkFileNames: 'assets/[name]-[hash].mjs',
      },
    },
  },
});
