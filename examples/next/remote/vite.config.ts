import { defineConfig } from 'vite';

export default defineConfig({
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
