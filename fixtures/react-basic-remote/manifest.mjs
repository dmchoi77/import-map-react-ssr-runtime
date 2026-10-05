const counter = {
  id: '@mfe/basic/counter',
  version: '1.0.0',
  client: 'https://fixture.invalid/remote/counter.client.mjs',
  server: './dist/server/counter.server.mjs',
};

export const serverManifest = {
  imports: {
    '@mfe/basic/counter': counter,
  },
};

export function createClientManifest(
  origin,
  client = new URL('/remote/counter.client.mjs', origin).href,
) {
  return {
    imports: {
      '@mfe/basic/counter': {
        ...counter,
        client,
      },
    },
  };
}

export default serverManifest;
