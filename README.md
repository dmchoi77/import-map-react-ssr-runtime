# MFE SSR Runtime

[한국어 README](./README.ko.md)

An SSR and hydration runtime for React microfrontends that use Import Maps.

MFE SSR Runtime connects a remote manifest to both sides of the application:

```text
remote manifest
  ├─ Node.js SSR: manifest specifier → remote URL
  ├─ Browser: manifest specifier → Import Map URL

Next.js entries config
  └─ webpack/Turbopack: entry specifier → local remote file alias
```

The runtime does not render React components for you and does not automatically
share React or other dependencies. A regular Host uses one remote manifest to
resolve modules in Node.js and in the browser. A Next.js Host connects the same
entry information to its bundler.

## Scope

Supported:

- Native ESM React remotes whose dependency graph can be resolved in Node.js and the browser
- Remote SSR in Node.js `>=20.6`
- Browser Import Map generation and HTML injection
- Host hydration with React `hydrateRoot()`
- Next.js webpack and Turbopack integration
- Both static `import` and dynamic `import()`

Out of scope:

- Automatic React or dependency sharing and negotiation between remotes
- Automatic configuration of the Host bundler's remote `external` settings
- Hydrating a remote independently from the Host React tree
- Distribution of non-JavaScript assets such as CSS and images

## The problem it solves

In a browser, an Import Map can resolve a bare specifier such as:

```tsx
import { RemoteApp } from '@mfe/catalog';
```

Node.js does not read Import Maps from HTML. A server therefore needs a separate
resolver for the same `@mfe/catalog` specifier.

MFE SSR Runtime provides:

1. A manifest format for mapping remote specifiers to URLs
2. A Node.js resolver and loader backed by that manifest
3. APIs for converting the manifest into a browser Import Map
4. Next.js webpack/Turbopack integration for local remote entries

A remote does not need separate `client` and `server` entries. Build one Native
ESM entry and expose the same public API to the Host on the server and in the
browser. The entry and its dependency graph must still be resolvable in both
environments.

## Quick start

The examples below use the recommended Golden Path:

- The remote entry bundles the React runtime it needs.
- The remote component is stateless.
- The Host client bundle includes the Host React runtime.
- Only the remote specifier remains external in the Host bundles.

This path demonstrates module resolution without requiring dependency sharing.
For stateful remotes that use Hooks or Context, see [React runtime contract](#react-runtime-contract).

### Install

For a standalone React SSR server, install these packages. React and React DOM
remain dependencies of the Host application.

```sh
pnpm add @mfe-ssr/core @mfe-ssr/import-map @mfe-ssr/node
```

| Package               | Purpose                                               |
| --------------------- | ----------------------------------------------------- |
| `@mfe-ssr/core`       | Manifest types, validation, and the shared resolver   |
| `@mfe-ssr/import-map` | Browser Import Map generation and HTML injection      |
| `@mfe-ssr/node`       | Node.js resolver, loader, and remote fetching for SSR |
| `@mfe-ssr/next`       | Next.js webpack/Turbopack local-entry aliases         |

Next.js Hosts only need the Next.js integration described in [Next.js bundler integration](#nextjs-bundler-integration):

```sh
pnpm add @mfe-ssr/next
```

### Remote entry

Expose the remote as an ordinary ESM export:

```tsx
// remote/src/catalog.tsx
export function RemoteApp({ initial = 0 }: { initial?: number }) {
  return <section>{initial}</section>;
}
```

Build this source as a Native ESM file such as `dist/catalog.mjs`, then deploy
it where both the browser and the SSR server can access it.

For the stateless example above, the remote can include React and the JSX
runtime in a self-contained ESM entry. This is useful for verifying module
resolution, but it is not a React singleton strategy.

For example, a Vite remote can use:

```ts
// remote/vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'src/catalog.tsx',
      external: [],
      output: {
        format: 'es',
        entryFileNames: 'catalog.mjs',
      },
    },
  },
});
```

This produces a self-contained `dist/catalog.mjs`. Do not use this exact
configuration for a remote that uses Hooks or Context. Such a remote must use
the same React runtime as the Host; see [React runtime contract](#react-runtime-contract).

If React is externalized, the remote entry imports `react` and
`react/jsx-runtime`:

```ts
// Optional part of remote/vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      external: ['react', 'react/jsx-runtime'],
    },
  },
});
```

A bare dependency imported by an HTTP(S) remote is not automatically resolved
from the Host's `node_modules` during Node.js SSR. Bundle it, map it explicitly,
or configure the SSR bundler accordingly.

### Manifest

Each manifest entry maps a remote specifier to a remote URL. `url` belongs to
the mapping entry; it is not a top-level manifest property.

```ts
// host/src/manifest.ts
import type { RemoteManifest } from '@mfe-ssr/core';

export const manifest = {
  imports: {
    '@mfe/catalog': {
      id: '@mfe/catalog',
      version: '1.0.0',
      url: 'https://cdn.example.com/catalog/catalog.mjs',
    },
  },
} satisfies RemoteManifest;
```

The server must load the manifest as JavaScript. If the source is TypeScript,
emit an equivalent module during the Host build:

```js
// host/dist/manifest.mjs
export const manifest = {
  imports: {
    '@mfe/catalog': {
      id: '@mfe/catalog',
      version: '1.0.0',
      url: 'https://cdn.example.com/catalog/catalog.mjs',
    },
  },
};
```

### Host component

The Host uses the same import in both environments. It does not select a
server-specific or client-specific remote entry:

```tsx
// host/src/HostApp.tsx
import { RemoteApp } from '@mfe/catalog';

export function HostApp() {
  return (
    <>
      <output id="host-status">SSR ready</output>
      <RemoteApp initial={0} />
    </>
  );
}
```

### Preserve the remote import in Host bundles

The Host bundle must retain `@mfe/catalog` so that the Node.js loader or the
browser Import Map can resolve it. With Vite/Rollup, mark the remote specifier
as external in both the client and server builds:

```ts
import { defineConfig } from 'vite';

const remoteSpecifiers = ['@mfe/catalog'];

export default defineConfig({
  build: {
    rollupOptions: {
      external: remoteSpecifiers,
    },
  },
});
```

In the Golden Path, only `@mfe/catalog` remains external because the Host
bundles its own React runtime. If React is also managed through an Import Map,
externalize it according to the [React runtime contract](#react-runtime-contract).

When using a module script directly without a bundler, no `external` setting is
needed.

### Build the Host

Apply the remote external setting to both builds. One possible Vite setup is:

```ts
// host/vite.client.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: 'src/client.tsx',
      external: ['@mfe/catalog'],
      output: { entryFileNames: 'client.mjs', format: 'es' },
    },
  },
});
```

```ts
// host/vite.server.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: 'src/HostApp.tsx',
      external: ['@mfe/catalog'],
      output: { entryFileNames: 'HostApp.mjs', format: 'es' },
    },
  },
});
```

```sh
pnpm exec vite build --config remote/vite.config.ts
pnpm exec vite build --config host/vite.client.config.ts
pnpm exec vite build --config host/vite.server.config.ts
node dist/server.mjs
```

`server.mjs` is the application-server entry that contains the SSR code below.
Adjust `dist/client.mjs`, `dist/HostApp.mjs`, and `dist/server.mjs` to match the
layout of your project.

### Server-side rendering

Call `registerNodeLoader()` before importing the Host module. If the Host is
imported first, Node.js cannot resolve its remote specifiers through the
manifest.

```js
// host/dist/server.mjs
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createImportMapScript } from '@mfe-ssr/import-map';
import { registerNodeLoader } from '@mfe-ssr/node';
import { manifest } from './manifest.mjs';

registerNodeLoader(manifest, {
  baseUrl: new URL('./', import.meta.url).href,
  allowedOrigins: ['https://cdn.example.com'],
});

const { HostApp } = await import('./HostApp.mjs');
const body = renderToString(createElement(HostApp));
const importMapScript = createImportMapScript(manifest);
const html = `
  <div id="app-root">${body}</div>
  ${importMapScript}
  <script type="module" src="/client.mjs"></script>
`;

// Send html through your HTTP server response.
```

The example shows the essential SSR path. Your server must also serve:

- `/client.mjs`, the Host hydration entry
- the remote URL registered in the manifest

The Import Map script must appear before any module script that imports the
remote or another dependency managed by the Import Map.

### Browser hydration

The client bundle hydrates the same Host tree with `hydrateRoot()`:

```tsx
// host/src/client.tsx
import { hydrateRoot } from 'react-dom/client';
import { HostApp } from './HostApp';

const root = document.getElementById('app-root');

if (root) {
  hydrateRoot(root, <HostApp />);
}
```

Build this file as `/client.mjs`. Its `@mfe/catalog` import must remain in the
bundle so the browser can resolve it through the Import Map.

### Hydration contract

The library does not hydrate a remote separately. The Host calls `hydrateRoot()`
for the complete React tree, and the remote participates as a child of that
tree.

The Host and remote must satisfy these conditions:

- The server and browser resolve the same remote export.
- The initial SSR and hydration use the same props and initial data.
- Render output does not depend directly on browser-only APIs, time, or random values.
- A remote using Hooks or Context uses a React runtime compatible with the Host.

## React runtime contract

Before adding a stateful remote, decide how the Host and remote will share React.

- The Host and remote must use compatible React and JSX runtime versions.
- The browser client bundle and the remote's `react` import must resolve to the same Import Map URL.
- The SSR bundle and the remote's `react` import must resolve to the same server-side React module.
- A bare `react` import in an HTTP(S) remote does not automatically fall back to the Node.js Host's `node_modules`.

The library does not automatically construct or negotiate this dependency graph.
For a stateful HTTP(S) remote, make React resolution explicit by bundling the
remote, adding manifest mappings, or configuring the SSR bundler.

## Static and dynamic imports

### Static import

Use a static import when the remote is always required:

```tsx
import { RemoteApp } from '@mfe/catalog';

export function HostApp() {
  return <RemoteApp initial={0} />;
}
```

The Node.js loader maps the specifier to the manifest entry's `url`, while the
browser uses the same entry through the Import Map.

### Dynamic import

Use a dynamic import for route-level splitting or lazy loading:

```tsx
import { lazy, Suspense } from 'react';

const RemoteApp = lazy(() =>
  import('@mfe/catalog').then(({ RemoteApp: Component }) => ({
    default: Component,
  })),
);

export function HostApp() {
  return (
    <Suspense fallback={<p>Loading remote...</p>}>
      <RemoteApp initial={0} />
    </Suspense>
  );
}
```

Static and dynamic imports can use the same manifest entry. `React.lazy()` is a
client-side lazy-loading API, however, so it does not by itself guarantee that
the remote is included in `renderToString()` output.

If the dynamic remote must be included in SSR, load it on the server before
constructing the React tree:

```js
const { RemoteApp } = await import('@mfe/catalog');
// Build the SSR tree with RemoteApp.
```

For Suspense-based streaming SSR, use React's streaming SSR API or the approach
provided by your framework.

## Browser Import Map API

Convert a manifest into a browser Import Map or an HTML script:

```js
import {
  createBrowserImportMap,
  createImportMapScript,
  serializeImportMap,
} from '@mfe-ssr/import-map';

const importMap = createBrowserImportMap(manifest);
const script = createImportMapScript(manifest);
const serialized = serializeImportMap(importMap);
```

To add a browser dependency that is not in the remote manifest, extend the
Import Map before serializing it:

```js
const importMap = createBrowserImportMap(manifest);
importMap.imports.react = '/vendor/react.mjs';

const script = `<script type="importmap">${serializeImportMap(importMap)}</script>`;
```

The Import Map must be inserted before module scripts. Browsers do not merge
multiple Import Maps reliably for this use case, so emit one final Import Map in
the Host HTML.

## Next.js bundler integration

Next.js integration does not replace a browser Import Map. It adds aliases so
that Next.js webpack and Turbopack can resolve a local remote file while
building the application:

```text
Next.js webpack/Turbopack
  -> local remote entry alias
  -> Next.js server/client bundle
```

An import used by a Next.js page is resolved by the Next.js bundler, not by an
Import Map in the HTML. If a separate module script needs Native Import Maps,
inject one with `@mfe-ssr/import-map`.

### Install

```sh
pnpm add @mfe-ssr/next
```

### Configure

`url` must point to a local file that the Next.js bundler can read. This is a
different use case from a browser manifest whose `url` points to a CDN.

```js
// next.config.mjs
import { fileURLToPath } from 'node:url';
import { withNextRemoteEntries } from '@mfe-ssr/next';

const remoteRoot = new URL('../catalog-remote/', import.meta.url);

export default withNextRemoteEntries(
  { reactStrictMode: true },
  {
    entries: {
      '@mfe/catalog': {
        url: fileURLToPath(new URL('dist/catalog.mjs', remoteRoot)),
      },
    },
  },
);
```

If the remote is outside the Next.js project, you may also need to configure
the output tracing root or another workspace setting so Next.js can read it.

### Use in a page

Use a client component boundary for a remote that uses Hooks or Context:

```tsx
// app/page.tsx
'use client';

import { RemoteApp } from '@mfe/catalog';

export default function Page() {
  return <RemoteApp initial={0} />;
}
```

`withNextRemoteEntries()` configures the same alias for webpack and Turbopack.
The remote does not need Next.js-specific `server` and `client` files, but it
must provide a Native ESM build artifact at a path that Next.js can read.

## Manifest

### Exact mapping

```ts
{
  '@mfe/catalog': {
    id: '@mfe/catalog',
    version: '1.0.0',
    url: 'https://cdn.example.com/catalog/catalog.mjs',
  },
}
```

### Prefix mapping

An entry whose specifier and URL end with `/` maps nested specifiers:

```ts
{
  '@mfe/ui/': {
    id: '@mfe/ui',
    version: '1.0.0',
    url: 'https://cdn.example.com/ui/',
  },
}
```

With this mapping, `@mfe/ui/button` resolves to
`https://cdn.example.com/ui/button`.

### Scope

`scopes` can apply a different mapping based on the URL of the importing module:

```ts
{
  scopes: {
    '/checkout/': {
      '@mfe/catalog': {
        id: '@mfe/catalog-checkout',
        version: '1.0.0',
        url: 'https://cdn.example.com/catalog/checkout.mjs',
      },
    },
  },
}
```

### Integrity

`integrity` contains SRI metadata used by browser Import Maps and Node.js remote
fetching. Generate the digest from the actual deployed file:

```ts
{
  id: '@mfe/catalog',
  version: '1.0.0',
  url: 'https://cdn.example.com/catalog/catalog.mjs',
  integrity: 'sha384-<base64-digest>',
}
```

### Validation

Each manifest entry requires `id`, `version`, and `url`. `validateManifest()`
checks the manifest structure and the formats of URLs, prefix mappings, scopes,
and integrity metadata.

## API reference

### `@mfe-ssr/core`

- `RemoteManifest`: type for remote mappings
- `ImportMap`: browser Import Map type
- `validateManifest()`: validate manifest structure and URLs
- `ManifestError`: manifest validation error
- `createManifestResolver()`: create a manifest-backed specifier resolver
- `toImportMap()`: convert a manifest into a browser Import Map object

### `@mfe-ssr/import-map`

- `createBrowserImportMap()`: convert a manifest into an Import Map object
- `createImportMapScript()`: create an Import Map script for SSR HTML
- `serializeImportMap()`: safely serialize an Import Map as JSON
- `createModulePreloadLinks()`: create modulepreload links for selected remotes
- `injectImportMap()`: inject an Import Map into a browser document

### `@mfe-ssr/node`

- `createNodeResolver()`: resolve a remote URL from Node.js code
- `registerNodeLoader()`: register a Node loader for subsequently imported modules
- `RemoteModuleFetcher`: fetch HTTP remotes, verify integrity, and cache results
- `checkRemoteHealth()`: check the health of a remote endpoint

`registerNodeLoader()` applies to modules imported after registration. It does
not affect static imports that execute before the registration call in the same
file. Import the Host with `await import()` after registering the loader.

When using HTTP(S) remotes, list allowed origins in `allowedOrigins`. The
default is an empty list, so unapproved origins are not fetched. Configure
`timeoutMs`, `maxResponseBytes`, `cache`, and `onDiagnostic` for fetch and
observability policies:

```js
registerNodeLoader(manifest, {
  allowedOrigins: ['https://cdn.example.com'],
  timeoutMs: 5_000,
  maxResponseBytes: 1024 * 1024,
});
```

### `@mfe-ssr/next`

- `withNextRemoteEntries()`: add local remote-entry aliases to Next.js webpack and Turbopack

## Deployment checklist

### Remote deployment

- The remote entry is built as Native ESM.
- The browser and SSR server can access the remote URL.
- CORS is configured when the browser loads a remote from another origin.
- The remote and Host use compatible React runtimes.
- Bare dependencies imported by an HTTP(S) remote are bundled or explicitly mapped.
- Nested modules and assets imported by the remote are deployed as well.

### Host build

- Remote specifiers are preserved in both client and server bundles.
- Vite/Rollup `external` settings apply to both builds.
- The Import Map appears before module scripts in the HTML.
- SSR and hydration use the same props and initial data.

### Security and reliability

- Production remotes use HTTPS URLs.
- `integrity` is configured where appropriate.
- Remote timeout, caching, and failure-handling policies are defined.
- Manifest versions are managed together with remote deployment versions.

## Current limitations

- React remote SSR and hydration are the primary supported use case.
- Node.js `>=20.6` ESM loaders are required.
- Static and dynamic imports can use the same manifest entry.
- Host bundler `external` configuration remains the application's responsibility.
- `React.lazy()` alone does not guarantee dynamic remote SSR with `renderToString()`; load the remote first or use streaming SSR when necessary.
- No pipeline is provided for non-JavaScript remote assets such as CSS and images.
- The API and manifest format may change before the first stable release.
