import { createServer } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { createBasicMiddleware } from './server.mjs';

let server;

afterEach(async () => {
  await new Promise((resolvePromise, reject) => {
    if (!server) {
      resolvePromise();
      return;
    }
    server.close((error) => (error ? reject(error) : resolvePromise()));
    server = undefined;
  });
});

describe('basic React fixture host', () => {
  it('renders one remote with a hydration contract and import map', async () => {
    server = createServer();
    server.on(
      'request',
      createBasicMiddleware({
        loadHostApp: async () => ({ HostApp: () => null }),
        loadRemote: async () => ({
          default: () => 'Counter remote',
        }),
      }),
    );

    await new Promise((resolvePromise, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolvePromise);
    });

    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('Counter remote');
    expect(html).toContain('<script type="importmap">');
    expect(html).toContain('data-mfe-react-root="counter-root"');
    expect(html).toContain('data-mfe-react-hydration="counter-root"');
    expect(html).toContain('/runtime/react/bootstrap.mjs');
  });
});
