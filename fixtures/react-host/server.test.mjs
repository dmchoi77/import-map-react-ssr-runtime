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
