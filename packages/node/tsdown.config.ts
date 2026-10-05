import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/loader.ts', 'src/preload.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
});
