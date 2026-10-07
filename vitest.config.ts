import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'fixtures/**/*.test.mjs', 'examples/**/*.test.mjs'],
  },
});
