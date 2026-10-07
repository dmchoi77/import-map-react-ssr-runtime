import { createServer } from 'node:http';

import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { createReactViteMiddleware } from './server.mjs';

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

describe('React Vite example host', () => {
  it('renders the Host and remote with an Import Map and hydration entry', async () => {
    server = createServer();
    server.on(
      'request',
      createReactViteMiddleware({
        loadHostApp: async () => ({
          HostApp: () => createElement('p', null, 'Vite React remote'),
        }),
        clientPath: '/app/client.mjs',
        remoteClientPath: '/remote/remote.mjs',
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
    expect(html).toContain('Vite React remote');
    expect(html).toContain('<script type="importmap">');
    expect(html).toContain('/remote/remote.mjs');
    expect(html).toContain('<div id="app-root"><p>Vite React remote</p></div>');
    expect(html).toContain('<script type="module" src="/app/client.mjs"></script>');
  });
});
