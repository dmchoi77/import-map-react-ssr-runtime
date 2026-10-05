import { registerNodeLoader } from '../../packages/node/dist/index.mjs';

import manifest from './manifest.mjs';

registerNodeLoader(manifest, {
  allowedOrigins: ['http://127.0.0.1:4180'],
  baseUrl: new URL('./', import.meta.url).href,
  maxResponseBytes: 64 * 1024,
  timeoutMs: 1_000,
});
