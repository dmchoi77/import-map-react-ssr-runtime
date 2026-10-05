import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: './nested-remote-loader',
        replacement: fileURLToPath(
          new URL('./src/nested-remote-loader.client.ts', import.meta.url),
        ),
      },
    ],
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    rollupOptions: {
      preserveEntrySignatures: 'strict',
      input: {
        'counter.client': 'src/counter.client.tsx',
        'profile.client': 'src/profile.client.tsx',
        'dashboard.client': 'src/dashboard.client.tsx',
      },
      external: ['react', 'react/jsx-runtime'],
      output: {
        entryFileNames: '[name].mjs',
        chunkFileNames: 'assets/[name]-[hash].mjs',
      },
    },
  },
});
