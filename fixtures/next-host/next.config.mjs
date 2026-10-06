import { fileURLToPath } from 'node:url';

import { withNextRemoteEntries } from '@mfe-ssr/next';

const remoteRoot = new URL('../react-basic-remote/', import.meta.url);
const remoteEntries = {
  counter: {
    url: fileURLToPath(new URL('dist/counter.mjs', remoteRoot)),
  },
  badge: {
    url: fileURLToPath(new URL('dist/badge.mjs', remoteRoot)),
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
