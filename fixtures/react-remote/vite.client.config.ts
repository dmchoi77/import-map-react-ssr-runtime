import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    rollupOptions: {
      preserveEntrySignatures: 'strict',
      input: {
        'counter.client': 'src/counter.client.tsx',
        'profile.client': 'src/profile.client.tsx',
      },
      external: ['react', 'react/jsx-runtime'],
      output: {
        entryFileNames: '[name].mjs',
        chunkFileNames: 'assets/[name]-[hash].mjs',
      },
    },
  },
});
