const entries = {
  counter: {
    id: '@mfe/fixture/counter',
    version: '1.0.0',
    server: './dist/server/counter.server.mjs',
    client: 'https://fixture.invalid/remote/counter.client.mjs',
  },
  profile: {
    id: '@mfe/fixture/profile',
    version: '1.0.0',
    server: './dist/server/profile.server.mjs',
    client: 'https://fixture.invalid/remote/profile.client.mjs',
  },
};

export const serverManifest = {
  imports: {
    '@mfe/fixture/counter': entries.counter,
    '@mfe/fixture/profile': entries.profile,
  },
};

export function createClientManifest(
  origin,
  clientPath = (remoteName) => `/remote/${remoteName}.client.mjs`,
) {
  return {
    imports: {
      '@mfe/fixture/counter': {
        ...entries.counter,
        client: new URL(clientPath('counter'), origin).href,
      },
      '@mfe/fixture/profile': {
        ...entries.profile,
        client: new URL(clientPath('profile'), origin).href,
      },
    },
  };
}

export default serverManifest;
