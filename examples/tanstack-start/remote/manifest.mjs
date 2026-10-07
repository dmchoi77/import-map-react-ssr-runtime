const remote = {
  id: '@example/tanstack-start/remote',
  version: '1.0.0',
  url: './dist/remote.mjs',
};

export const manifest = {
  imports: {
    '@example/tanstack-start/remote': remote,
  },
};

export function createBrowserManifest(remoteUrl = '/remote/remote.mjs') {
  return {
    imports: {
      '@example/tanstack-start/remote': {
        ...remote,
        url: remoteUrl,
      },
    },
  };
}

export default manifest;
