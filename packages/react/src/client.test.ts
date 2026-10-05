// @vitest-environment happy-dom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { hydrateReactRemotes } from './client';

const COUNTER_REMOTE_SPECIFIER = pathToFileURL(
  resolve(process.cwd(), 'packages/react/src/fixtures/counter-remote.mjs'),
).href;
const MISSING_REMOTE_SPECIFIER = pathToFileURL(
  resolve(process.cwd(), 'packages/react/src/fixtures/missing-remote.mjs'),
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
    vi.restoreAllMocks();
  });

  it('imports the contract specifier natively and hydrates its SSR root', async () => {
    const root = appendRemoteRoot();

    await act(async () => {
      await hydrateReactRemotes(document);
    });

    expect(root.dataset.mfeFallback).toBeUndefined();
    act(() => root.querySelector('button')?.click());
    expect(root.textContent).toBe('Count: 1');
  });

  it('shows a safe fallback when a remote module cannot be imported', async () => {
    const root = appendRemoteRoot({ specifier: MISSING_REMOTE_SPECIFIER });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await hydrateReactRemotes(document);

    expect(root.dataset.mfeFallback).toBe('client');
    expect(root.textContent).toBe('Remote unavailable');
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it('shows a fallback for a malformed hydration contract without breaking other roots', async () => {
    const root = appendRemoteRoot();
    const healthyRoot = appendRemoteRoot({ rootId: 'healthy-root' });
    const contract = document.querySelector<HTMLScriptElement>(
      'script[data-mfe-react-hydration="counter-root"]',
    );
    contract!.textContent = '{invalid json';
    vi.spyOn(console, 'error').mockImplementation(() => {});

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
});
