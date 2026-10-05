import { defineConfig } from 'tsdown';

// Browser-native import maps perform module resolution; this package only builds map utilities.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
});
