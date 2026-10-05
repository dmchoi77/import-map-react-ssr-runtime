import { describe, expect, it } from 'vitest';

import { createNodeResolver } from './index';
import { RemoteModuleFetcher } from './remote-fetcher';
import { initialize, resolve as resolveHook } from './loader';
import type { RemoteManifest } from '@mfe-ssr/core';

const manifest: RemoteManifest = {
  imports: {
    '@mfe/counter': {
      id: '@mfe/counter',
      version: '1.0.0',
      client: 'https://cdn.example.com/counter/client.js',
      server: './remotes/counter/server.mjs',
    },
    '@mfe/ui/': {
      id: '@mfe/ui',
      version: '1.0.0',
      client: 'https://cdn.example.com/ui/',
      server: './remotes/ui/',
    },
  },
};

describe('createNodeResolver', () => {
  it('resolves server entries from the manifest', () => {
    const resolve = createNodeResolver(manifest, {
      baseUrl: 'file:///srv/host/',
    });

    expect(resolve('@mfe/counter')).toBe('file:///srv/host/remotes/counter/server.mjs');
    expect(resolve('@mfe/ui/button')).toBe('file:///srv/host/remotes/ui/button');
    expect(resolve('@mfe/missing')).toBeUndefined();
  });
});

describe('Node loader hooks', () => {
  it('resolves a mapped server specifier and short-circuits the hook chain', async () => {
    initialize({
      manifest,
      options: {
        baseUrl: 'file:///srv/host/',
      },
    });

    const result = await resolveHook(
      '@mfe/counter',
      {
        conditions: [],
        importAttributes: {},
        parentURL: 'file:///srv/host/server.mjs',
      },
      async () => {
        throw new Error('nextResolve should not be called for a mapped specifier');
      },
    );

    expect(result).toEqual({
      url: 'file:///srv/host/remotes/counter/server.mjs',
      shortCircuit: true,
    });
  });

  it('resolves relative imports from an HTTP remote against its parent URL', async () => {
    initialize({
      manifest,
      options: {
        baseUrl: 'file:///srv/host/',
      },
    });

    const result = await resolveHook(
      './dep.mjs',
      {
        conditions: [],
        importAttributes: {},
        parentURL: 'https://cdn.example.com/remotes/entry.mjs',
      },
      async () => {
        throw new Error('nextResolve should not be called for a relative HTTP import');
      },
    );

    expect(result).toEqual({
      url: 'https://cdn.example.com/remotes/dep.mjs',
      shortCircuit: true,
    });
  });
});

describe('RemoteModuleFetcher', () => {
  it('fetches an allowed module and shares concurrent requests in memory', async () => {
    let calls = 0;
    const fetcher = new RemoteModuleFetcher({
      allowedOrigins: ['https://cdn.example.com'],
      fetch: async () => {
        calls += 1;
        return new Response('export default "remote"', {
          headers: {
            'content-type': 'text/javascript',
          },
        });
      },
    });

    const [first, second] = await Promise.all([
      fetcher.fetch('https://cdn.example.com/remote.mjs'),
      fetcher.fetch('https://cdn.example.com/remote.mjs'),
    ]);

    expect(first).toBe('export default "remote"');
    expect(second).toBe(first);
    expect(calls).toBe(1);
    expect(fetcher.size).toBe(1);
  });

  it('rejects origins outside the allowlist', async () => {
    const fetcher = new RemoteModuleFetcher({
      allowedOrigins: ['https://cdn.example.com'],
      fetch: async () => new Response('export default "remote"'),
    });

    await expect(fetcher.fetch('https://evil.example.com/remote.mjs')).rejects.toMatchObject({
      code: 'REMOTE_ORIGIN_NOT_ALLOWED',
    });
  });

  it('rejects a fetch that exceeds the timeout', async () => {
    const fetcher = new RemoteModuleFetcher({
      allowedOrigins: ['https://cdn.example.com'],
      timeoutMs: 5,
      fetch: async () => new Promise<Response>(() => undefined),
    });

    await expect(fetcher.fetch('https://cdn.example.com/slow.mjs')).rejects.toMatchObject({
      code: 'REMOTE_FETCH_TIMEOUT',
    });
  });

  it('rejects a response larger than the configured limit', async () => {
    const fetcher = new RemoteModuleFetcher({
      allowedOrigins: ['https://cdn.example.com'],
      maxResponseBytes: 4,
      fetch: async () => new Response('12345'),
    });

    await expect(fetcher.fetch('https://cdn.example.com/large.mjs')).rejects.toMatchObject({
      code: 'REMOTE_RESPONSE_TOO_LARGE',
    });
  });

  it('keeps concurrent responses isolated by URL', async () => {
    const fetcher = new RemoteModuleFetcher({
      allowedOrigins: ['https://cdn.example.com'],
      fetch: async (input) => {
        const url = String(input);
        await new Promise((resolve) => setTimeout(resolve, url.endsWith('/a.mjs') ? 5 : 1));
        return new Response(
          url.endsWith('/a.mjs') ? 'export const value = "a"' : 'export const value = "b"',
        );
      },
    });

    const [a, b] = await Promise.all([
      fetcher.fetch('https://cdn.example.com/a.mjs'),
      fetcher.fetch('https://cdn.example.com/b.mjs'),
    ]);

    expect(a).toContain('"a"');
    expect(b).toContain('"b"');
  });
});
