import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  ManifestError,
  createManifestResolver,
  toImportMap,
  validateManifest,
  type RemoteManifest,
} from './index';

const integrityFor = (value: string): string => {
  return `sha384-${createHash('sha384').update(value).digest('base64')}`;
};

const manifest: RemoteManifest = {
  imports: {
    '@mfe/cart': {
      id: '@mfe/cart',
      version: '1.0.0',
      client: 'https://cdn.example.com/cart/client.js',
      server: 'file:///srv/cart/server.js',
      integrity: {
        client: integrityFor('cart client'),
        server: integrityFor('cart server'),
      },
    },
    '@mfe/ui/': {
      id: '@mfe/ui',
      version: '2.0.0',
      client: 'https://cdn.example.com/ui/',
      server: 'file:///srv/ui/',
    },
  },
  scopes: {
    '/checkout/': {
      '@mfe/cart': {
        id: '@mfe/cart-checkout',
        version: '1.1.0',
        client: 'https://cdn.example.com/cart-checkout/client.js',
        server: 'file:///srv/cart-checkout/server.js',
        integrity: {
          client: integrityFor('checkout client'),
          server: integrityFor('checkout server'),
        },
      },
    },
  },
};

describe('validateManifest', () => {
  it('accepts a valid manifest', () => {
    expect(() => validateManifest(manifest)).not.toThrow();
  });

  it('accepts relative URL scopes', () => {
    expect(() =>
      validateManifest({
        imports: {},
        scopes: {
          './checkout/': {},
        },
      }),
    ).not.toThrow();
  });

  it('rejects an empty specifier', () => {
    expect(() =>
      validateManifest({
        imports: {
          '': manifest.imports['@mfe/cart'],
        },
      }),
    ).toThrowError(ManifestError);
  });

  it('rejects an invalid module URL', () => {
    expect(() =>
      validateManifest({
        imports: {
          '@mfe/broken': {
            id: '@mfe/broken',
            version: '1.0.0',
            client: 'not a URL',
            server: 'file:///srv/broken.js',
          },
        },
      }),
    ).toThrowError(ManifestError);
  });

  it('rejects conflicting entries with the same id', () => {
    expect(() =>
      validateManifest({
        imports: {
          '@mfe/a': manifest.imports['@mfe/cart'],
          '@mfe/b': {
            ...manifest.imports['@mfe/cart'],
            client: 'https://cdn.example.com/other.js',
          },
        },
      }),
    ).toThrowError(ManifestError);
  });

  it('rejects a prefix mapping whose target is not a prefix', () => {
    expect(() =>
      validateManifest({
        imports: {
          '@mfe/ui/': {
            ...manifest.imports['@mfe/ui/'],
            client: 'https://cdn.example.com/ui/index.js',
          },
        },
      }),
    ).toThrowError(ManifestError);
  });

  it('rejects integrity metadata without a supported digest', () => {
    expect(() =>
      validateManifest({
        imports: {
          '@mfe/unsupported': {
            ...manifest.imports['@mfe/cart'],
            integrity: { client: 'sha1-unsupported' },
          },
        },
      }),
    ).toThrowError(ManifestError);
  });

  it('rejects malformed stronger integrity metadata instead of falling back to a weaker hash', () => {
    const malformedSha512 = `sha512-${'A'.repeat(64)}`;
    expect(() =>
      validateManifest({
        imports: {
          '@mfe/malformed-integrity': {
            ...manifest.imports['@mfe/cart'],
            integrity: {
              client: `${integrityFor('valid client')} ${malformedSha512}`,
            },
          },
        },
      }),
    ).toThrowError(ManifestError);
  });

  it('accepts unpadded Base64URL integrity digests', () => {
    const digest = integrityFor('source-0').split('-')[1];
    const base64UrlDigest = digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    expect(() =>
      validateManifest({
        imports: {
          '@mfe/base64url': {
            ...manifest.imports['@mfe/cart'],
            integrity: { client: `sha384-${base64UrlDigest}` },
          },
        },
      }),
    ).not.toThrow();
  });
});

describe('toImportMap', () => {
  it('creates a browser import map with client URLs and integrity metadata', () => {
    expect(toImportMap(manifest, 'client')).toEqual({
      imports: {
        '@mfe/cart': 'https://cdn.example.com/cart/client.js',
        '@mfe/ui/': 'https://cdn.example.com/ui/',
      },
      scopes: {
        '/checkout/': {
          '@mfe/cart': 'https://cdn.example.com/cart-checkout/client.js',
        },
      },
      integrity: {
        'https://cdn.example.com/cart/client.js': integrityFor('cart client'),
        'https://cdn.example.com/cart-checkout/client.js': integrityFor('checkout client'),
      },
    });
  });

  it('creates a server import map with server URLs', () => {
    expect(toImportMap(manifest, 'server')).toEqual({
      imports: {
        '@mfe/cart': 'file:///srv/cart/server.js',
        '@mfe/ui/': 'file:///srv/ui/',
      },
      scopes: {
        '/checkout/': {
          '@mfe/cart': 'file:///srv/cart-checkout/server.js',
        },
      },
      integrity: {
        'file:///srv/cart/server.js': integrityFor('cart server'),
        'file:///srv/cart-checkout/server.js': integrityFor('checkout server'),
      },
    });
  });

  it('rejects conflicting integrity metadata for the same target URL', () => {
    const first = manifest.imports['@mfe/cart'];
    const conflictingManifest: RemoteManifest = {
      imports: {
        '@mfe/first': { ...first, id: '@mfe/first' },
        '@mfe/second': {
          ...first,
          id: '@mfe/second',
          integrity: {
            client: integrityFor('conflicting client'),
            server: integrityFor('cart server'),
          },
        },
      },
    };

    expect(() => toImportMap(conflictingManifest, 'client')).toThrowError(
      expect.objectContaining({ code: 'CONFLICTING_ENTRY' }),
    );
  });
});

describe('createManifestResolver', () => {
  it('rejects a file base URL for the client target', () => {
    expect(() =>
      createManifestResolver(manifest, 'client', {
        baseUrl: 'file:///srv/app/',
      }),
    ).toThrowError(ManifestError);
  });

  it('resolves exact and prefix imports for the selected target', () => {
    const resolver = createManifestResolver(manifest, 'server');

    expect(resolver.resolve('@mfe/cart')).toBe('file:///srv/cart/server.js');
    expect(resolver.resolve('@mfe/ui/button')).toBe('file:///srv/ui/button');
    expect(resolver.resolve('@mfe/missing')).toBeUndefined();
  });

  it('uses the most specific matching scope before top-level imports', () => {
    const resolver = createManifestResolver(manifest, 'client', {
      baseUrl: 'https://app.example.com/',
    });

    expect(resolver.resolve('@mfe/cart', 'https://app.example.com/checkout/page')).toBe(
      'https://cdn.example.com/cart-checkout/client.js',
    );
    expect(resolver.resolve('@mfe/cart', 'https://app.example.com/account/page')).toBe(
      'https://cdn.example.com/cart/client.js',
    );
  });
});
