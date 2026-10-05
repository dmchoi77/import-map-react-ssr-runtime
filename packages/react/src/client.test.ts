// @vitest-environment happy-dom

import { finished } from 'node:stream/promises';
import { runInNewContext } from 'node:vm';
import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { hydrateReactRemotes, setReactDiagnosticHandler } from './client';
import { renderReactRemoteBySpecifierToStream } from './server';

const COUNTER_REMOTE_SPECIFIER = pathToFileURL(
  resolve(
    process.cwd(),
    process.env.MFE_REACT_18_FIXTURE === '1'
      ? 'fixtures/react18-compat/counter-remote.mjs'
      : 'packages/react/src/fixtures/counter-remote.mjs',
  ),
).href;
const MISSING_REMOTE_SPECIFIER = pathToFileURL(
  resolve(process.cwd(), 'packages/react/src/fixtures/missing-remote.mjs'),
).href;
const STALLED_REMOTE_SPECIFIER = pathToFileURL(
  resolve(process.cwd(), 'packages/react/src/fixtures/stalled-client-remote.mjs'),
).href;

function appendRemoteRoot({
  rootId = 'counter-root',
  specifier = COUNTER_REMOTE_SPECIFIER,
}: { rootId?: string; specifier?: string } = {}) {
  const root = document.createElement('div');
  root.id = rootId;
  root.dataset.mfeReactRoot = rootId;
  root.innerHTML = '<button id="counter-increment" type="button">Count: <!-- -->0</button>';

  const contract = document.createElement('script');
  contract.type = 'application/json';
  contract.dataset.mfeReactHydration = rootId;
  contract.textContent = JSON.stringify({
    specifier,
    props: { initial: 0 },
    identifierPrefix: `${rootId}-`,
  });

  document.body.append(root, contract);
  return root;
}

describe('hydrateReactRemotes', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    setReactDiagnosticHandler(undefined);
    vi.restoreAllMocks();
  });

  it('imports the contract specifier natively and hydrates its SSR root', async () => {
    const root = appendRemoteRoot();
    const events: unknown[] = [];

    await act(async () => {
      await hydrateReactRemotes(document, { onDiagnostic: (event) => events.push(event) });
    });

    expect(events).toMatchObject([
      { phase: 'resolve', outcome: 'success' },
      { phase: 'hydrate', outcome: 'success' },
    ]);
    expect(root.dataset.mfeFallback).toBeUndefined();
    act(() => root.querySelector('button')?.click());
    expect(root.textContent).toBe('Count: 1');
  });

  it('shows a safe fallback when a remote module cannot be imported', async () => {
    const root = appendRemoteRoot({
      specifier: `${MISSING_REMOTE_SPECIFIER}?token=not-logged`,
    });
    const events: unknown[] = [];

    await hydrateReactRemotes(document, { onDiagnostic: (event) => events.push(event) });

    expect(root.dataset.mfeFallback).toBe('client');
    expect(root.textContent).toBe('Remote unavailable');
    expect(events).toMatchObject([
      { phase: 'resolve', outcome: 'failure', errorCode: 'REMOTE_IMPORT_FAILED' },
      { phase: 'hydrate', outcome: 'failure', errorCode: 'HYDRATION_FAILED' },
    ]);
    expect(JSON.stringify(events)).not.toContain('not-logged');
    expect(JSON.stringify(events)).not.toContain(MISSING_REMOTE_SPECIFIER);
  });

  it('shows a fallback for a malformed hydration contract without breaking other roots', async () => {
    const root = appendRemoteRoot();
    const healthyRoot = appendRemoteRoot({ rootId: 'healthy-root' });
    const contract = document.querySelector<HTMLScriptElement>(
      'script[data-mfe-react-hydration="counter-root"]',
    );
    contract!.textContent = '{invalid json';
    await act(async () => {
      await hydrateReactRemotes(document);
    });

    expect(root.dataset.mfeFallback).toBe('client');
    expect(root.textContent).toBe('Remote unavailable');
    expect(healthyRoot.dataset.mfeFallback).toBeUndefined();
    expect(healthyRoot.textContent).toBe('Count: 0');
  });

  it('is idempotent when the bootstrap is evaluated more than once', async () => {
    const root = appendRemoteRoot();

    await act(async () => {
      await Promise.all([hydrateReactRemotes(document), hydrateReactRemotes(document)]);
    });

    act(() => root.querySelector('button')?.click());
    expect(root.textContent).toBe('Count: 1');
  });

  it('mounts the browser remote over a server fallback without duplicate roots', async () => {
    const specifier = COUNTER_REMOTE_SPECIFIER;
    const serverStream = renderReactRemoteBySpecifierToStream({
      specifier,
      props: { initial: 0 },
      loadRemote: async () => {
        throw new Error('server import temporarily failed');
      },
      fallback: 'Loading remote',
      errorFallback: 'Remote unavailable',
      rootId: 'fallback-root',
    });
    const serverChunks: Buffer[] = [];
    let fallbackWasStreamed = false;
    serverStream.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      if (text.includes('Loading remote')) fallbackWasStreamed = true;
      serverChunks.push(Buffer.from(chunk));
    });
    await finished(serverStream);
    expect(fallbackWasStreamed).toBe(true);
    setStreamedMarkup(Buffer.concat(serverChunks).toString());
    const root = document.querySelector<HTMLElement>('#fallback-root')!;
    const events: unknown[] = [];

    await act(async () => {
      await hydrateReactRemotes(document, { onDiagnostic: (event) => events.push(event) });
    });

    expect(root.querySelectorAll('#counter-increment')).toHaveLength(1);
    expect(root.textContent).toBe('Count: 0');
    expect(events).toMatchObject([
      { phase: 'resolve', outcome: 'success' },
      { phase: 'hydrate', outcome: 'success' },
    ]);
    act(() => root.querySelector('button')?.click());
    expect(root.textContent).toBe('Count: 1');
  });

  it('renders the configured client fallback when the browser import rejects', async () => {
    const suspense = {
      fallback: 'Loading remote',
      errorFallback: 'Remote unavailable',
      timeoutMs: 1_000,
    };
    const serverStream = renderReactRemoteBySpecifierToStream({
      specifier: MISSING_REMOTE_SPECIFIER,
      props: { initial: 0 },
      loadRemote: async () => ({
        default: ({ initial }: { initial: number }) =>
          createElement('button', { type: 'button' }, `Server count: ${initial}`),
      }),
      fallback: suspense.fallback,
      errorFallback: suspense.errorFallback,
      timeoutMs: suspense.timeoutMs,
      rootId: 'client-reject-root',
    });
    const serverChunks: Buffer[] = [];
    for await (const chunk of serverStream) serverChunks.push(Buffer.from(chunk));
    setStreamedMarkup(Buffer.concat(serverChunks).toString());
    const root = document.querySelector<HTMLElement>('#client-reject-root')!;
    const events: unknown[] = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      await hydrateReactRemotes(document, { onDiagnostic: (event) => events.push(event) });
    });

    expect(root.textContent).toBe('Remote unavailable');
    expect(root.dataset.mfeFallback).toBe('client');
    expect(events).toMatchObject([
      { phase: 'resolve', outcome: 'failure', errorCode: 'REMOTE_IMPORT_FAILED' },
      { phase: 'hydrate', outcome: 'failure', errorCode: 'REMOTE_IMPORT_FAILED' },
    ]);
  });

  it('uses the configured handler for the automatic bootstrap entry point', async () => {
    const root = appendRemoteRoot();
    const events: unknown[] = [];
    setReactDiagnosticHandler((event) => events.push(event));

    await act(async () => {
      await hydrateReactRemotes(document);
    });

    expect(root.textContent).toBe('Count: 0');
    expect(events).toMatchObject([
      { phase: 'resolve', outcome: 'success' },
      { phase: 'hydrate', outcome: 'success' },
    ]);
  });

  it('renders the configured client fallback when the browser import times out', async () => {
    const serverStream = renderReactRemoteBySpecifierToStream({
      specifier: STALLED_REMOTE_SPECIFIER,
      props: { initial: 0 },
      loadRemote: async () => ({
        default: ({ initial }: { initial: number }) =>
          createElement('button', { type: 'button' }, `Server count: ${initial}`),
      }),
      fallback: 'Loading remote',
      errorFallback: 'Client import timed out',
      timeoutMs: 20,
      rootId: 'client-import-timeout-root',
    });
    const serverChunks: Buffer[] = [];
    for await (const chunk of serverStream) serverChunks.push(Buffer.from(chunk));
    setStreamedMarkup(Buffer.concat(serverChunks).toString());
    const root = document.querySelector<HTMLElement>('#client-import-timeout-root')!;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      await hydrateReactRemotes(document);
    });

    expect(root.textContent).toBe('Client import timed out');
    expect(root.dataset.mfeFallback).toBe('client');
  });
});

function setStreamedMarkup(markup: string): void {
  document.body.innerHTML = markup;
  for (const script of document.querySelectorAll<HTMLScriptElement>(
    'script:not([type="application/json"])',
  )) {
    runInNewContext(script.textContent ?? '', { document, window });
    script.remove();
  }
}
