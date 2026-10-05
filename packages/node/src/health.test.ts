import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { RemoteManifest } from '@mfe-ssr/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { checkRemoteHealth } from './health';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('checkRemoteHealth', () => {
  it('checks each remote once and returns safe endpoint and structured diagnostics', async () => {
    const events: unknown[] = [];
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe('HEAD');
      expect(init?.redirect).toBe('manual');
      return new Response(null, { status: 204 });
    });
    const manifest: RemoteManifest = {
      imports: {
        '@mfe/catalog': {
          id: 'catalog',
          version: '1.0.0',
          client: 'https://cdn.example.com/catalog.mjs?token=private',
          server: 'https://user:password@cdn.example.com/catalog.mjs?token=private#fragment',
        },
        '@mfe/catalog-alias': {
          id: 'catalog',
          version: '1.0.0',
          client: 'https://cdn.example.com/catalog.mjs?token=private',
          server: 'https://user:password@cdn.example.com/catalog.mjs?token=private#fragment',
        },
      },
      scopes: {
        '/checkout/': {
          '@mfe/catalog': {
            id: 'catalog',
            version: '1.0.0',
            client: 'https://cdn.example.com/catalog.mjs?token=private',
            server: 'https://user:password@cdn.example.com/catalog.mjs?token=private#fragment',
          },
        },
      },
    };

    const results = await checkRemoteHealth(manifest, {
      allowedOrigins: ['https://cdn.example.com'],
      fetch,
      onDiagnostic: (event) => events.push(event),
    });

    expect(fetch).toHaveBeenCalledOnce();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      remoteId: 'catalog',
      endpoint: 'https://cdn.example.com/catalog.mjs',
      status: 'healthy',
      statusCode: 204,
      checkedAt: expect.any(String),
      durationMs: expect.any(Number),
    });
    expect(JSON.stringify([results, events])).not.toContain('password');
    expect(JSON.stringify([results, events])).not.toContain('token=private');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      phase: 'health-check',
      outcome: 'success',
      remoteId: 'catalog',
      statusCode: 204,
    });
  });

  it('denies HTTP checks outside the explicit origin allowlist', async () => {
    const fetch = vi.fn();
    const [result] = await checkRemoteHealth(
      {
        imports: {
          '@mfe/private': {
            id: 'private',
            version: '1.0.0',
            client: 'https://private.example.com/client.mjs',
            server: 'https://private.example.com/server.mjs',
          },
        },
      },
      { fetch: fetch as typeof globalThis.fetch },
    );

    expect(result).toMatchObject({
      status: 'unhealthy',
      errorCode: 'REMOTE_ORIGIN_NOT_ALLOWED',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('checks file URLs without fetching or evaluating source', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mfe-health-'));
    directories.push(directory);
    const existingFile = join(directory, 'remote.mjs');
    await writeFile(existingFile, 'export default "not evaluated";');
    const baseUrl = pathToFileURL(`${directory}/`).href;
    const results = await checkRemoteHealth(
      {
        imports: {
          '@mfe/present': {
            id: 'present',
            version: '1.0.0',
            client: 'https://cdn.example.com/present.mjs',
            server: './remote.mjs',
          },
          '@mfe/missing': {
            id: 'missing',
            version: '1.0.0',
            client: 'https://cdn.example.com/missing.mjs',
            server: './missing.mjs',
          },
        },
      },
      { baseUrl },
    );

    expect(results).toMatchObject([
      { remoteId: 'present', endpoint: pathToFileURL(existingFile).href, status: 'healthy' },
      { remoteId: 'missing', status: 'unhealthy', errorCode: 'REMOTE_FILE_UNAVAILABLE' },
    ]);
  });

  it('returns an unhealthy result for an HTTP error without exposing response details', async () => {
    const [result] = await checkRemoteHealth(
      {
        imports: {
          '@mfe/missing': {
            id: 'missing',
            version: '1.0.0',
            client: 'https://cdn.example.com/client.mjs',
            server: 'https://cdn.example.com/missing.mjs',
          },
        },
      },
      {
        allowedOrigins: ['https://cdn.example.com'],
        fetch: async () => new Response(null, { status: 503 }),
      },
    );

    expect(result).toMatchObject({
      status: 'unhealthy',
      statusCode: 503,
      errorCode: 'REMOTE_HTTP_ERROR',
    });
    expect(result).not.toHaveProperty('error');
    expect(result).not.toHaveProperty('message');
  });

  it('aborts a stalled health request and reports a timeout code', async () => {
    const [result] = await checkRemoteHealth(
      {
        imports: {
          '@mfe/stalled': {
            id: 'stalled',
            version: '1.0.0',
            client: 'https://cdn.example.com/client.mjs',
            server: 'https://cdn.example.com/stalled.mjs',
          },
        },
      },
      {
        allowedOrigins: ['https://cdn.example.com'],
        timeoutMs: 5,
        fetch: async () => new Promise<Response>(() => {}),
      },
    );

    expect(result).toMatchObject({
      status: 'unhealthy',
      errorCode: 'REMOTE_HEALTH_TIMEOUT',
    });
  });
});
