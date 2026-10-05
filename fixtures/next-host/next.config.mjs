import { fileURLToPath } from 'node:url';

import { withNextRemoteEntries } from '@mfe-ssr/next';

const remoteRoot = new URL('../react-basic-remote/', import.meta.url);
const remoteEntries = {
  counter: {
    client: fileURLToPath(new URL('dist/client/counter.client.mjs', remoteRoot)),
    server: fileURLToPath(new URL('dist/server/counter.server.mjs', remoteRoot)),
  },
  badge: {
    client: fileURLToPath(new URL('dist/client/badge.client.mjs', remoteRoot)),
    server: fileURLToPath(new URL('dist/server/badge.server.mjs', remoteRoot)),
  },
};

export default withNextRemoteEntries(
  {
    reactStrictMode: true,
    outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  },
  {
    entries: {
      '@mfe/basic/counter': remoteEntries.counter,
      '@mfe/basic/badge': remoteEntries.badge,
    },
  },
);
