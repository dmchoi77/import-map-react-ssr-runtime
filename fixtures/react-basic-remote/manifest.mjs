const counter = {
  id: '@mfe/basic/counter',
  version: '1.0.0',
  client: 'https://fixture.invalid/remote/counter.client.mjs',
  server: './dist/server/counter.server.mjs',
};

const badge = {
  id: '@mfe/basic/badge',
  version: '1.0.0',
  client: 'https://fixture.invalid/remote/badge.client.mjs',
  server: './dist/server/badge.server.mjs',
};

export const serverManifest = {
  imports: {
    '@mfe/basic/counter': counter,
    '@mfe/basic/badge': badge,
  },
};

export function createClientManifest(
  origin,
  client = new URL('/remote/counter.client.mjs', origin).href,
  badgeClient = new URL('/remote/badge.client.mjs', origin).href,
) {
  return {
    imports: {
      '@mfe/basic/counter': {
        ...counter,
        client,
      },
      '@mfe/basic/badge': {
        ...badge,
        client: badgeClient,
      },
    },
  };
}

export default serverManifest;
