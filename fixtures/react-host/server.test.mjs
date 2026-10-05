import { afterEach, describe, expect, it } from 'vitest';

import { createFixtureServer } from './server.mjs';

const remoteModules = new Map([
  [
    '@mfe/fixture/counter',
    new URL('../react-remote/dist/server/counter.server.mjs', import.meta.url).href,
  ],
  [
    '@mfe/fixture/profile',
    new URL('../react-remote/dist/server/profile.server.mjs', import.meta.url).href,
  ],
]);

let fixture;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

describe('React fixture host', () => {
  it('renders two independent remote roots and a browser import map', async () => {
    fixture = await createFixtureServer({
      loadRemote: async (specifier) => {
        const moduleUrl = remoteModules.get(specifier);
        if (!moduleUrl) {
          throw new Error(`Unknown fixture remote: ${specifier}`);
        }
        return import(moduleUrl);
      },
    });

    const response = await fetch(`${fixture.origin}/`);
    const html = await response.text();
    const normalizedHtml = html.replace(/<!--.*?-->/g, '');

    expect(response.status).toBe(200);
    expect(html).toContain('data-mfe-page="home"');
    expect(html).toContain('id="host-app-root"');
    expect(html).toContain('SSR ready');
    expect(html).toContain('data-mfe-react-root="counter-root"');
    expect(html).toContain('data-mfe-react-root="profile-root"');
    expect(normalizedHtml).toContain('Count: 0');
    expect(normalizedHtml).toContain('Ada Lovelace');
    expect(html).toContain('data-mfe-react-hydration="counter-root">');
    expect(html).toContain('"specifier":"@mfe/fixture/counter"');
    expect(html).toContain('"props":{"label":"Counter","state":{"count":0}}');

    const importMapIndex = html.indexOf('<script type="importmap">');
    const bootstrapIndex = html.indexOf(
      '<script type="module" src="/runtime/react/bootstrap.mjs">',
    );
    const moduleScriptCount = [...html.matchAll(/<script type="module"/g)].length;
    expect(importMapIndex).toBeGreaterThanOrEqual(0);
    expect(bootstrapIndex).toBeGreaterThan(importMapIndex);
    expect(moduleScriptCount).toBe(1);
    expect(html).not.toContain('hydrateRoot');
    expect(html).not.toContain('hydrateReactRemotes');

    expect(html).toContain(`${fixture.origin}/remote/counter.client.mjs`);
    expect(html).toContain(`${fixture.origin}/remote/profile.client.mjs`);

    const importMap = JSON.parse(
      html.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1] ?? '{}',
    );
    expect(importMap.imports['@mfe-ssr/browser']).toBeUndefined();
    expect(importMap.imports['@mfe-ssr/import-map']).toBeUndefined();
  });

  it('returns a fallback page when a remote cannot be loaded', async () => {
    fixture = await createFixtureServer({
      loadRemote: async () => {
        throw new Error('fixture remote unavailable');
      },
    });

    const response = await fetch(`${fixture.origin}/failure`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('data-mfe-page="failure"');
    expect(html).toContain('data-mfe-fallback="server"');
    expect(html).toContain('Remote unavailable');
  });

  it('streams the host shell before a delayed remote resolves', async () => {
    let markRemoteStarted;
    const remoteStarted = new Promise((resolve) => {
      markRemoteStarted = resolve;
    });
    fixture = await createFixtureServer({
      loadRemote: async () => {
        markRemoteStarted();
        await new Promise((resolve) => setTimeout(resolve, 50));
        return import(remoteModules.get('@mfe/fixture/counter'));
      },
    });

    const response = await fetch(`${fixture.origin}/stream`);
    expect(response.status).toBe(200);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = '';
    while (!html.includes('host-status')) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }

    expect(html).toContain('SSR ready');
    await remoteStarted;
    while (!html.includes('Loading remote')) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    expect(html).toContain('data-mfe-react-root="counter-root"');
    expect(html).toContain('Loading remote');
    expect(html).not.toContain('Count: 0');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();

    expect(html).toContain('data-mfe-react-root="counter-root"');
    expect(html.replace(/<!--.*?-->/g, '')).toContain('Count: 0');
    expect(html).toContain('data-mfe-react-hydration="counter-root"');
    expect(html).toContain('</html>');
  });

  it('streams a fallback and closes the response when a streamed remote is unavailable', async () => {
    fixture = await createFixtureServer({
      loadRemote: async () => {
        throw new Error('fixture remote unavailable');
      },
    });

    const response = await fetch(`${fixture.origin}/stream-failure`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('id="host-app-root"');
    expect(html).toContain('data-mfe-react-root="counter-root"');
    expect(html).toContain('Remote unavailable');
    expect(html).toContain('"errorFallback":"Remote unavailable"');
    expect(html).toContain('"serverFallback":true');
    expect(html).toContain('</html>');
  });

  it('finishes the HTTP response with a fallback when the remote loader times out', async () => {
    fixture = await createFixtureServer({
      loadRemote: () => new Promise(() => {}),
    });

    const startedAt = Date.now();
    const response = await fetch(`${fixture.origin}/stream`);
    const html = await response.text();

    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expect(response.status).toBe(200);
    expect(html).toContain('data-mfe-react-root="counter-root"');
    expect(html).toContain('Remote unavailable');
    expect(html).toContain('</html>');
  });

  it('aborts a pending remote load when the streaming client disconnects', async () => {
    let markRemoteStarted;
    let markRemoteAborted;
    const remoteStarted = new Promise((resolve) => {
      markRemoteStarted = resolve;
    });
    const remoteAborted = new Promise((resolve) => {
      markRemoteAborted = resolve;
    });
    fixture = await createFixtureServer({
      loadRemote: (_specifier, { signal }) => {
        markRemoteStarted();
        return new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              markRemoteAborted();
              reject(new Error('remote load aborted'));
            },
            { once: true },
          );
        });
      },
    });

    const response = await fetch(`${fixture.origin}/stream`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let shell = '';
    while (!shell.includes('host-status')) {
      const { done, value } = await reader.read();
      if (done) break;
      shell += decoder.decode(value, { stream: true });
    }
    await remoteStarted;
    await reader.cancel();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('The remote load was not aborted.')), 1000);
      remoteAborted.then(() => {
        clearTimeout(timeout);
        resolve();
      });
    });
  });

  it('serves client entries separately from server entries', async () => {
    fixture = await createFixtureServer({
      loadRemote: async (specifier) => {
        const moduleUrl = remoteModules.get(specifier);
        return import(moduleUrl);
      },
    });

    const response = await fetch(`${fixture.origin}/remote/counter.client.mjs`);
    const source = await response.text();

    expect(response.status).toBe(200);
    expect(source).toContain('client');
    expect(source).not.toContain('server-only fixture entry');

    const clientAssetImport = source.match(/from\s*["'](\.\/assets\/[^"']+)["']/)?.[1];
    expect(clientAssetImport).toBeDefined();

    const assetResponse = await fetch(
      new URL(clientAssetImport, `${fixture.origin}/remote/counter.client.mjs`),
    );
    expect(assetResponse.status).toBe(200);
    expect(await assetResponse.text()).toContain('counter-increment');
  });

  it('serves the library-owned browser bootstrap and hydration runtime modules', async () => {
    fixture = await createFixtureServer({
      loadRemote: async () => {
        throw new Error('not needed for static asset checks');
      },
    });

    const [bootstrapResponse, runtimeResponse] = await Promise.all([
      fetch(`${fixture.origin}/runtime/react/bootstrap.mjs`),
      fetch(`${fixture.origin}/runtime/react/client.mjs`),
    ]);

    expect(bootstrapResponse.status).toBe(200);
    expect(runtimeResponse.status).toBe(200);
    const bootstrapSource = await bootstrapResponse.text();
    expect(bootstrapSource).toContain('./client.mjs');
    expect(await runtimeResponse.text()).toContain('hydrateRoot');
  });
});
