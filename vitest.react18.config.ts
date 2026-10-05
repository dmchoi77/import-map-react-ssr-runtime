import { fileURLToPath } from 'node:url';

import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from './vitest.config';

const react18Modules = fileURLToPath(
  new URL('./fixtures/react18-compat/node_modules/', import.meta.url),
);

export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: [
        {
          find: /^react-dom\/client$/,
          replacement: `${react18Modules}/react-dom/client.js`,
        },
        {
          find: /^react-dom\/server$/,
          replacement: `${react18Modules}/react-dom/server.node.js`,
        },
        {
          find: /^react\/jsx-runtime$/,
          replacement: `${react18Modules}/react/jsx-runtime.js`,
        },
        {
          find: /^react$/,
          replacement: `${react18Modules}/react/index.js`,
        },
      ],
    },
    test: {
      setupFiles: ['./fixtures/react18-compat/vitest.setup.ts'],
    },
  }),
);
