import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: true,
    outDir: 'dist/server',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/counter.server.tsx',
      external: ['react', 'react/jsx-runtime'],
      output: {
        entryFileNames: 'counter.server.mjs',
        chunkFileNames: 'assets/[name]-[hash].mjs',
      },
    },
  },
});
