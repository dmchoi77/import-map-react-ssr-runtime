import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: true,
    outDir: 'dist/server',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        counter: 'src/counter.server.tsx',
        badge: 'src/badge.server.tsx',
      },
      external: ['@mfe/basic/badge', 'react', 'react/jsx-runtime'],
      output: {
        entryFileNames: '[name].server.mjs',
        chunkFileNames: 'assets/[name]-[hash].mjs',
      },
    },
  },
});
