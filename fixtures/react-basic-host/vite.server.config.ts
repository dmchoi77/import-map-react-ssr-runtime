import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: true,
    outDir: 'dist/server',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/app.server.tsx',
      external: ['@mfe/basic/counter', 'react', 'react-dom/server', 'react/jsx-runtime'],
      output: {
        entryFileNames: '[name].mjs',
      },
    },
  },
});
