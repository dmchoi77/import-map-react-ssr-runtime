import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/client.ts', 'src/serialize.ts', 'src/server.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  deps: {
    neverBundle: [
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      'react-dom/server',
    ],
  },
});
