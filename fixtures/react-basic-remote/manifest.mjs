const counter = {
  id: '@mfe/basic/counter',
  version: '1.0.0',
  url: './dist/counter.mjs',
};

const badge = {
  id: '@mfe/basic/badge',
  version: '1.0.0',
  url: './dist/badge.mjs',
};

export const manifest = {
  imports: {
    '@mfe/basic/counter': counter,
    '@mfe/basic/badge': badge,
  },
};

export function createBrowserManifest(
  origin,
  counterUrl = new URL('/remote/counter.mjs', origin).href,
  badgeUrl = new URL('/remote/badge.mjs', origin).href,
) {
  return {
    imports: {
      '@mfe/basic/counter': {
        ...counter,
        url: counterUrl,
      },
      '@mfe/basic/badge': {
        ...badge,
        url: badgeUrl,
      },
    },
  };
}

export default manifest;
