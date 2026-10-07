const remote = {
  id: '@example/react-vite/remote',
  version: '1.0.0',
  url: './dist/remote.mjs',
};

export const manifest = {
  imports: {
    '@example/react-vite/remote': remote,
  },
};

export function createBrowserManifest(
  origin,
  remoteUrl = new URL('/remote/remote.mjs', origin).href,
) {
  return {
    imports: {
      '@example/react-vite/remote': {
        ...remote,
        url: remoteUrl,
      },
    },
  };
}

export default manifest;
