import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: true,
    outDir: 'dist/server',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'counter.server': 'src/counter.server.tsx',
        'profile.server': 'src/profile.server.tsx',
      },
      external: ['react', 'react/jsx-runtime'],
      output: {
        entryFileNames: '[name].mjs',
        chunkFileNames: 'assets/[name]-[hash].mjs',
      },
    },
  },
});
