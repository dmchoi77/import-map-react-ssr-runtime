import { createServer } from 'node:http';

import { createElement } from 'react';
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
  it('renders the host root with an import map and client entry', async () => {
    server = createServer();
    server.on(
      'request',
      createBasicMiddleware({
        loadHostApp: async () => ({
          HostApp: () => createElement('p', null, 'Nested counter remote'),
        }),
        clientPath: '/app/app.client.mjs',
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
    expect(html).toContain('Nested counter remote');
    expect(html).toContain('<script type="importmap">');
    expect(html).toContain('/remote/counter.client.mjs');
    expect(html).toContain('/remote/badge.client.mjs');
    expect(html).toContain('<div id="app-root"><p>Nested counter remote</p></div>');
    expect(html).toContain('<script type="module" src="/app/app.client.mjs"></script>');
    expect(html).not.toContain('data-mfe-react-root');
  });
});
