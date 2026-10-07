import { fileURLToPath } from 'node:url';

import { withNextRemoteEntries } from '@mfe-ssr/next';

const remoteRoot = new URL('../remote/', import.meta.url);

export default withNextRemoteEntries(
  {
    reactStrictMode: true,
    outputFileTracingRoot: fileURLToPath(new URL('../../../', import.meta.url)),
  },
  {
    entries: {
      '@example/next/remote': {
        url: fileURLToPath(new URL('dist/remote.mjs', remoteRoot)),
      },
    },
  },
);
