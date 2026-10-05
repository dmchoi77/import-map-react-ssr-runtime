import { registerNodeLoader } from '../../packages/node/dist/index.mjs';

import serverManifest from '../react-basic-remote/manifest.mjs';

registerNodeLoader(serverManifest, {
  baseUrl: new URL('../react-basic-remote/', import.meta.url).href,
});
