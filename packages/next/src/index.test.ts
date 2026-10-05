import { describe, expect, it } from 'vitest';

import { withNextRemoteEntries, type NextWebpackConfig, type NextTurbopackConfig } from './index';

const entries = {
  '@mfe/cart': {
    client: 'remotes/cart.client.mjs',
    server: 'remotes/cart.server.mjs',
  },
  '@mfe/ui/': {
    client: 'remotes/ui/client/',
    server: 'remotes/ui/server/',
  },
};

describe('withNextRemoteEntries', () => {
  it('adds exact server and client aliases while preserving existing aliases', () => {
    const config = withNextRemoteEntries(
      {
        reactStrictMode: true,
        turbopack: {
          resolveAlias: {
            existing: '/existing-turbopack.mjs',
          },
        } satisfies NextTurbopackConfig,
        webpack(webpackConfig: NextWebpackConfig) {
          return {
            ...webpackConfig,
            custom: true,
            resolve: {
              ...webpackConfig.resolve,
              alias: {
                ...webpackConfig.resolve?.alias,
                existing: '/existing.mjs',
              },
            },
          };
        },
      },
      { entries },
    );

    const result = config.webpack(
      {
        resolve: {
          alias: {
            fromNext: '/next.mjs',
          },
        },
      },
      { isServer: true },
    );

    expect(result).toMatchObject({
      custom: true,
      resolve: {
        alias: {
          fromNext: '/next.mjs',
          existing: '/existing.mjs',
          '@mfe/cart$': 'remotes/cart.server.mjs',
          '@mfe/ui/': 'remotes/ui/server/',
        },
      },
    });

    expect(config.turbopack.resolveAlias).toEqual({
      existing: '/existing-turbopack.mjs',
      '@mfe/cart': {
        browser: 'remotes/cart.client.mjs',
        default: 'remotes/cart.server.mjs',
      },
      '@mfe/ui/*': {
        browser: 'remotes/ui/client/*',
        default: 'remotes/ui/server/*',
      },
    });
  });

  it('uses client entries for the browser build', () => {
    const config = withNextRemoteEntries({}, { entries });

    const result = config.webpack({ resolve: { alias: {} } }, { isServer: false });

    expect(result.resolve?.alias).toEqual({
      '@mfe/cart$': 'remotes/cart.client.mjs',
      '@mfe/ui/': 'remotes/ui/client/',
    });
  });

  it('converts absolute entry paths to paths relative to the Next project', () => {
    const projectRoot = process.cwd();
    const config = withNextRemoteEntries(
      {},
      {
        turbopackRoot: '/workspace',
        entries: {
          '@mfe/cart': {
            client: `${projectRoot}/remotes/cart.client.mjs`,
            server: `${projectRoot}/remotes/cart.server.mjs`,
          },
        },
      },
    );

    expect(config.turbopack).toMatchObject({
      root: '/workspace',
      resolveAlias: {
        '@mfe/cart': {
          browser: './remotes/cart.client.mjs',
          default: './remotes/cart.server.mjs',
        },
      },
    });
  });
});
