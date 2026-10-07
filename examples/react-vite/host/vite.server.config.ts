import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: true,
    outDir: 'dist/server',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/app.server.tsx',
      external: ['@example/react-vite/remote', 'react', 'react-dom/server', 'react/jsx-runtime'],
      output: {
        entryFileNames: '[name].mjs',
      },
    },
  },
});
