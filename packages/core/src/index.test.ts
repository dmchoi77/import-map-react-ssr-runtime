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
      url: 'https://cdn.example.com/cart/remote.mjs',
      integrity: integrityFor('cart'),
    },
    '@mfe/ui/': {
      id: '@mfe/ui',
      version: '2.0.0',
      url: 'https://cdn.example.com/ui/',
    },
  },
  scopes: {
    '/checkout/': {
      '@mfe/cart': {
        id: '@mfe/cart-checkout',
        version: '1.1.0',
        url: 'https://cdn.example.com/cart-checkout/remote.mjs',
        integrity: integrityFor('checkout'),
      },
    },
  },
};

describe('validateManifest', () => {
  it('accepts a valid single-entry Native ESM manifest', () => {
    expect(() => validateManifest(manifest)).not.toThrow();
  });

  it('accepts relative URL scopes', () => {
    expect(() =>
      validateManifest({
        imports: {},
        scopes: { './checkout/': {} },
      }),
    ).not.toThrow();
  });

  it('rejects an empty specifier', () => {
    expect(() => validateManifest({ imports: { '': manifest.imports['@mfe/cart'] } })).toThrowError(
      ManifestError,
    );
  });

  it('rejects an invalid module URL', () => {
    expect(() =>
      validateManifest({
        imports: {
          '@mfe/broken': {
            id: '@mfe/broken',
            version: '1.0.0',
            url: 'not a URL',
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
            url: 'https://cdn.example.com/other.mjs',
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
            url: 'https://cdn.example.com/ui/index.mjs',
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
            integrity: 'sha1-unsupported',
          },
        },
      }),
    ).toThrowError(ManifestError);
  });

  it('rejects malformed stronger integrity metadata instead of falling back to a weaker hash', () => {
    expect(() =>
      validateManifest({
        imports: {
          '@mfe/malformed-integrity': {
            ...manifest.imports['@mfe/cart'],
            integrity: `${integrityFor('valid')} sha512-${'A'.repeat(64)}`,
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
            integrity: `sha384-${base64UrlDigest}`,
          },
        },
      }),
    ).not.toThrow();
  });
});

describe('toImportMap', () => {
  it('creates a browser import map from the same remote URL used by SSR', () => {
    expect(toImportMap(manifest)).toEqual({
      imports: {
        '@mfe/cart': 'https://cdn.example.com/cart/remote.mjs',
        '@mfe/ui/': 'https://cdn.example.com/ui/',
      },
      scopes: {
        '/checkout/': {
          '@mfe/cart': 'https://cdn.example.com/cart-checkout/remote.mjs',
        },
      },
      integrity: {
        'https://cdn.example.com/cart/remote.mjs': integrityFor('cart'),
        'https://cdn.example.com/cart-checkout/remote.mjs': integrityFor('checkout'),
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
          integrity: integrityFor('conflicting'),
        },
      },
    };

    expect(() => toImportMap(conflictingManifest)).toThrowError(
      expect.objectContaining({ code: 'CONFLICTING_ENTRY' }),
    );
  });
});

describe('createManifestResolver', () => {
  it('allows a file base URL for a server host', () => {
    expect(() =>
      createManifestResolver(
        {
          imports: {
            '@mfe/cart': {
              id: '@mfe/cart',
              version: '1.0.0',
              url: './remote.mjs',
            },
          },
        },
        { baseUrl: 'file:///srv/app/' },
      ),
    ).not.toThrow();
  });

  it('resolves exact and prefix imports from the same URL contract', () => {
    const resolver = createManifestResolver(
      {
        imports: {
          '@mfe/cart': {
            id: '@mfe/cart',
            version: '1.0.0',
            url: './cart/remote.mjs',
          },
          '@mfe/ui/': {
            id: '@mfe/ui',
            version: '1.0.0',
            url: './ui/',
          },
        },
      },
      { baseUrl: 'file:///srv/app/' },
    );

    expect(resolver.resolve('@mfe/cart')).toBe('file:///srv/app/cart/remote.mjs');
    expect(resolver.resolve('@mfe/ui/button')).toBe('file:///srv/app/ui/button');
    expect(resolver.resolve('@mfe/missing')).toBeUndefined();
  });

  it('uses the most specific matching scope before top-level imports', () => {
    const resolver = createManifestResolver(manifest, { baseUrl: 'https://app.example.com/' });

    expect(resolver.resolve('@mfe/cart', 'https://app.example.com/checkout/page')).toBe(
      'https://cdn.example.com/cart-checkout/remote.mjs',
    );
    expect(resolver.resolve('@mfe/cart', 'https://app.example.com/account/page')).toBe(
      'https://cdn.example.com/cart/remote.mjs',
    );
  });

  it('reports resolution outcomes without including the specifier or resolved URL', () => {
    const events: unknown[] = [];
    const resolver = createManifestResolver(manifest, {
      onDiagnostic: (event) => events.push(event),
    });

    expect(resolver.resolve('@mfe/cart')).toBe('https://cdn.example.com/cart/remote.mjs');
    expect(resolver.resolve('@mfe/missing?token=private')).toBeUndefined();

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      phase: 'resolve',
      outcome: 'success',
      remoteId: '@mfe/cart',
      durationMs: expect.any(Number),
      timestamp: expect.any(String),
    });
    expect(events[1]).toMatchObject({ phase: 'resolve', outcome: 'unmatched' });
    expect(JSON.stringify(events)).not.toContain('token=private');
    expect(JSON.stringify(events)).not.toContain('https://cdn.example.com/cart/remote.mjs');
  });

  it('reports a stable error code for invalid resolution without exposing the input', () => {
    const events: unknown[] = [];
    const resolver = createManifestResolver(manifest, {
      onDiagnostic: (event) => events.push(event),
    });

    expect(() => resolver.resolve('')).toThrowError(ManifestError);
    expect(events).toMatchObject([
      { phase: 'resolve', outcome: 'failure', errorCode: 'INVALID_SPECIFIER' },
    ]);
  });

  it('does not let a diagnostic callback change resolver behavior', () => {
    const resolver = createManifestResolver(manifest, {
      onDiagnostic() {
        throw new Error('diagnostic sink failed');
      },
    });

    expect(resolver.resolve('@mfe/cart')).toBe('https://cdn.example.com/cart/remote.mjs');
    expect(() => resolver.resolve('')).toThrowError(ManifestError);
  });

  it('ignores rejected promises from asynchronous diagnostic callbacks', async () => {
    const resolver = createManifestResolver(manifest, {
      onDiagnostic: async () => {
        throw new Error('diagnostic sink failed asynchronously');
      },
    });

    expect(resolver.resolve('@mfe/cart')).toBe('https://cdn.example.com/cart/remote.mjs');
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
});
