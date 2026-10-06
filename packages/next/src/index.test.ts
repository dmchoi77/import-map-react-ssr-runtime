import { describe, expect, it } from 'vitest';

import { withNextRemoteEntries, type NextWebpackConfig, type NextTurbopackConfig } from './index';

const entries = {
  '@mfe/cart': {
    url: 'remotes/cart.mjs',
  },
  '@mfe/ui/': {
    url: 'remotes/ui/',
  },
};

describe('withNextRemoteEntries', () => {
  it('adds the same Native ESM aliases to both builds while preserving existing aliases', () => {
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
          '@mfe/cart$': 'remotes/cart.mjs',
          '@mfe/ui/': 'remotes/ui/',
        },
      },
    });

    expect(config.turbopack.resolveAlias).toEqual({
      existing: '/existing-turbopack.mjs',
      '@mfe/cart': {
        browser: 'remotes/cart.mjs',
        default: 'remotes/cart.mjs',
      },
      '@mfe/ui/*': {
        browser: 'remotes/ui/*',
        default: 'remotes/ui/*',
      },
    });
  });

  it('uses the same remote entries for the browser build', () => {
    const config = withNextRemoteEntries({}, { entries });

    const result = config.webpack({ resolve: { alias: {} } }, { isServer: false });

    expect(result.resolve?.alias).toEqual({
      '@mfe/cart$': 'remotes/cart.mjs',
      '@mfe/ui/': 'remotes/ui/',
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
            url: `${projectRoot}/remotes/cart.mjs`,
          },
        },
      },
    );

    expect(config.turbopack).toMatchObject({
      root: '/workspace',
      resolveAlias: {
        '@mfe/cart': {
          browser: './remotes/cart.mjs',
          default: './remotes/cart.mjs',
        },
      },
    });
  });
});
