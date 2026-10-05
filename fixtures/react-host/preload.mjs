import { registerNodeLoader } from '../../packages/node/dist/index.mjs';

import serverManifest from '../react-remote/manifest.mjs';

registerNodeLoader(serverManifest, {
  baseUrl: new URL('../react-remote/', import.meta.url).href,
  maxResponseBytes: 64 * 1024,
  timeoutMs: 1_000,
});
