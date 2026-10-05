import { describe, expect, it } from 'vitest';

import { loadWithTimeout } from './load';

describe('loadWithTimeout', () => {
  it('does not invoke the loader if the external signal aborts before its first microtask', async () => {
    const controller = new AbortController();
    let loaderCalls = 0;
    const loading = loadWithTimeout(
      async () => {
        loaderCalls += 1;
        return 'remote';
      },
      1_000,
      controller.signal,
    );

    controller.abort();

    await expect(loading).rejects.toMatchObject({ name: 'AbortError' });
    expect(loaderCalls).toBe(0);
  });
});
