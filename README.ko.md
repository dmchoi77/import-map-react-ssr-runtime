# MFE SSR Runtime

Import Map을 사용하는 React 마이크로프론트엔드 remote를 서버에서 SSR하고, 브라우저에서 같은 React tree를 hydration하기 위한 런타임입니다.

이 라이브러리는 React 컴포넌트를 대신 렌더링하거나 React 의존성을 자동으로 공유하지 않습니다. 일반 Host에서는 하나의 remote manifest를 기준으로 모듈 해석을 연결하고, Next.js에서는 같은 entry 정보를 bundler 설정에 연결합니다.

```text
remote manifest
  ├─ Node.js SSR: manifest specifier → remote URL
  ├─ Browser: manifest specifier → Import Map URL

Next.js entries config
  └─ webpack/Turbopack: entry specifier → local remote file alias
```

## 지원 범위

- Node.js와 브라우저에서 dependency graph를 해석할 수 있는 Native ESM React remote
- Node.js `>=20.6`에서의 remote SSR
- 브라우저 Import Map 생성과 HTML 삽입
- React의 `hydrateRoot()`를 사용하는 Host hydration
- Next.js webpack 및 Turbopack 연동
- 정적 `import`와 동적 `import()`

다음 기능은 현재 라이브러리의 책임 범위가 아닙니다.

- remote 간 React 또는 다른 dependency의 자동 공유와 협상
- Host 번들러의 remote `external` 설정 자동화
- remote 컴포넌트만 따로 수행하는 hydration
- CSS, 이미지 등 JavaScript 이외의 asset 배포

## 1. 해결하는 문제

브라우저에서는 Import Map으로 다음과 같은 bare specifier를 해석할 수 있습니다.

```tsx
import { RemoteApp } from '@mfe/catalog';
```

하지만 Node.js는 HTML의 Import Map을 읽지 않습니다. 따라서 브라우저에서 해석되는 `@mfe/catalog`을 서버에서 사용하려면 별도의 resolver가 필요합니다.

MFE SSR Runtime은 다음을 제공합니다.

1. remote specifier와 URL을 표현하는 manifest
2. manifest를 Node.js loader에서 사용하는 resolver
3. manifest를 브라우저 Import Map으로 변환하는 API
4. Next.js webpack/Turbopack에 remote entry를 연결하는 integration

remote는 `client`와 `server` entry를 따로 제공할 필요가 없습니다. 하나의 Native ESM entry를 빌드하고, Host가 서버와 브라우저에서 같은 public API를 사용하도록 구성합니다. 단, entry와 그 dependency graph가 각 실행 환경에서 해석 가능해야 합니다.

## 2. 최소 구성

이 절은 라이브러리가 연결해야 하는 지점을 보여주는 최소 예시입니다. 실제 프로젝트에서는 사용 중인 번들러의 build script와 HTTP 서버의 정적 파일 제공 설정을 추가해야 합니다.

이 문서의 기본 예제는 다음 Golden Path를 사용합니다.

- remote entry가 필요한 React runtime을 자체 포함합니다.
- remote 컴포넌트는 상태가 없는 React 컴포넌트입니다.
- Host client bundle은 Host의 React runtime을 자체 포함합니다.
- remote specifier만 bundle에서 external로 남깁니다.

React Hooks나 Context를 사용하는 remote의 React singleton 구성은 [React runtime 계약](#react-runtime-계약)에서 별도로 설명합니다.

| Remote 형태                              | 브라우저             | Node.js SSR             | 현재 문서의 기본 경로        |
| ---------------------------------------- | -------------------- | ----------------------- | ---------------------------- |
| self-contained Native ESM                | 지원                 | 지원                    | 예제에서 사용                |
| 상대 경로 dependency를 가진 ESM          | 지원                 | 지원                    | dependency graph에 따라 사용 |
| HTTP(S) remote의 bare `react` dependency | Import Map 설정 필요 | 자동 지원하지 않음      | 별도 구성 필요               |
| Next.js가 읽는 local ESM entry           | Next bundler 처리    | Next server bundle 처리 | Next.js 절에서 설명          |

구성 순서는 다음과 같습니다.

1. React remote를 Native ESM으로 빌드합니다.
2. Host client/server bundle에서 remote specifier를 보존합니다.
3. 서버에서 Node loader를 등록한 뒤 Host를 import합니다.
4. SSR HTML에 Import Map을 넣고 client bundle을 실행합니다.
5. client bundle이 같은 Host tree를 hydration합니다.

### 2.1 설치

직접 React SSR 서버를 구성한다면 다음 패키지를 설치합니다. React와 React DOM은 Host 애플리케이션의 의존성으로 설치되어 있어야 합니다.

```sh
pnpm add @mfe-ssr/core @mfe-ssr/import-map @mfe-ssr/node
```

| 패키지                | 역할                                         |
| --------------------- | -------------------------------------------- |
| `@mfe-ssr/core`       | manifest 타입, 검증, 공통 resolver           |
| `@mfe-ssr/import-map` | 브라우저 Import Map 생성과 HTML 삽입         |
| `@mfe-ssr/node`       | Node.js SSR용 resolver, loader, remote fetch |
| `@mfe-ssr/next`       | Next.js webpack/Turbopack alias 연동         |

Next.js Host는 [Next.js bundler 연동](#5-nextjs-bundler-연동)을 사용합니다.

```sh
pnpm add @mfe-ssr/next
```

### 2.2 Remote entry

remote는 React 컴포넌트를 일반적인 ESM export로 제공합니다.

```tsx
// remote/src/catalog.tsx
export function RemoteApp({ initial = 0 }: { initial?: number }) {
  return <section>{initial}</section>;
}
```

remote 프로젝트에서 이 소스를 `dist/catalog.mjs`와 같은 Native ESM 파일로 빌드하고, 브라우저와 SSR 서버가 접근할 수 있는 위치에 배포합니다.

이 최소 예제의 `RemoteApp`은 상태가 없는 컴포넌트이므로, React와 JSX runtime을 remote entry에 포함하는 self-contained Native ESM으로 빌드할 수 있습니다. 이 방식은 모듈 해석 경계를 확인하기 위한 예제이며, React runtime singleton을 보장하는 방식은 아닙니다.

예제와 같은 self-contained entry는 다음처럼 만들 수 있습니다.

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

이 설정은 `dist/catalog.mjs`에 React dependency를 포함합니다. Hooks나 Context를 사용하는 remote에는 그대로 적용하지 말고, 아래의 React runtime 계약에 따라 React를 Host와 공유해야 합니다.

React Hooks나 Context를 사용하는 실사용 remote는 Host와 같은 React runtime을 사용해야 합니다. React를 external로 빌드하는 경우의 browser/Node dependency 해석은 [React runtime 계약](#react-runtime-계약)을 따릅니다.

```ts
// remote/vite.config.ts의 선택적 설정
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      external: ['react', 'react/jsx-runtime'],
    },
  },
});
```

이 설정으로 생성된 remote entry는 `react`와 `react/jsx-runtime`을 import합니다. HTTP(S) remote의 bare dependency는 Host `node_modules`에서 자동으로 해석되지 않으므로, remote bundle·manifest mapping·SSR bundler 중 하나를 사용해야 합니다.

### 2.3 Manifest

manifest의 각 entry는 remote specifier와 remote URL을 연결합니다. `url`은 manifest 최상위 속성이 아니라 각 mapping entry의 속성입니다.

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

서버는 위 manifest를 JavaScript module로 읽어야 합니다. TypeScript manifest를 사용하는 경우 Host build 단계에서 다음과 같은 결과물을 생성합니다.

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

### 2.4 Host 컴포넌트

Host에서는 환경별 entry를 선택하지 않고 같은 import를 사용합니다.

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

### 2.5 Host bundle에서 remote import 보존

브라우저 Import Map이나 Node loader가 remote를 해석하려면 Host bundle에 `@mfe/catalog` import가 남아 있어야 합니다. Vite/Rollup에서는 client와 server build 양쪽에 remote specifier를 `external`로 지정합니다.

```ts
// vite.config.ts의 핵심 설정
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

Golden Path에서는 Host의 React runtime을 bundle에 포함하므로 `@mfe/catalog`만 external로 남깁니다. React runtime을 Import Map으로 관리하는 고급 구성은 [React runtime 계약](#react-runtime-계약)에 따라 별도로 external 처리합니다.

번들러 없이 module script를 직접 작성하는 경우에는 `external` 설정이 필요하지 않습니다.

### 2.6 Host build

위 설정을 client와 server build에 각각 적용하면 다음과 같은 산출물을 만들 수 있습니다.

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

`server.mjs`는 다음 절의 SSR 코드를 포함하는 애플리케이션 서버 entry입니다. `dist/client.mjs`, `dist/HostApp.mjs`, `dist/server.mjs`의 경로는 프로젝트 구조에 맞게 조정할 수 있습니다.

### 2.7 서버 SSR

`registerNodeLoader()`는 Host 모듈을 import하기 전에 호출해야 합니다. loader 등록보다 Host import가 먼저 실행되면 remote specifier를 해석할 수 없습니다.

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

// 사용하는 HTTP 서버의 응답으로 html을 전송합니다.
```

이 코드는 SSR 요청에서 필요한 핵심 부분만 보여줍니다. 실제 서버에서는 다음 파일도 정적으로 제공해야 합니다.

- `/client.mjs`: Host hydration entry
- manifest에 등록된 remote URL

Import Map script는 remote나 React runtime을 import하는 module script보다 먼저 HTML에 있어야 합니다.

### 2.8 브라우저 hydration

client bundle은 서버와 같은 Host tree를 `hydrateRoot()`로 hydration합니다.

```tsx
// host/src/client.tsx
import { hydrateRoot } from 'react-dom/client';
import { HostApp } from './HostApp';

const root = document.getElementById('app-root');

if (root) {
  hydrateRoot(root, <HostApp />);
}
```

이 파일은 `/client.mjs`로 빌드되어야 하며, `@mfe/catalog` import가 bundle에 남아 있어야 브라우저 Import Map이 이를 해석할 수 있습니다.

### 2.9 Hydration contract

이 라이브러리가 remote를 별도로 hydration하는 것은 아닙니다. Host가 `hydrateRoot()`로 전체 React tree를 hydration하고, remote는 그 tree의 일부로 참여합니다.

Host와 remote는 다음 조건을 지켜야 합니다.

- 서버와 브라우저가 같은 remote export를 해석해야 합니다.
- 최초 SSR과 hydration에서 같은 props와 초기 데이터를 사용해야 합니다.
- render 중 브라우저 전용 API, 시간, 난수처럼 결과가 달라지는 값을 직접 사용하지 않아야 합니다.
- Hooks나 Context를 사용하는 remote는 Host와 호환되는 동일한 React runtime을 사용해야 합니다.

### React runtime 계약

Golden Path 이후에 상태가 있는 remote를 추가하려면 React를 Host와 remote가 함께 사용하는 방식부터 정해야 합니다.

- Host와 remote가 동일한 React 버전과 JSX runtime을 사용해야 합니다.
- browser client bundle과 remote의 `react` import는 같은 Import Map 주소를 가리켜야 합니다.
- SSR bundle과 remote의 `react` import는 같은 server-side React module을 가리켜야 합니다.
- HTTP(S) remote의 bare `react` import는 Node.js Host의 `node_modules`로 자동 fallback하지 않습니다.

현재 라이브러리는 이 dependency graph를 자동으로 만들거나 협상하지 않습니다. 따라서 상태가 있는 HTTP(S) remote는 remote bundle, manifest mapping, SSR bundler 중 하나를 사용해 React runtime 해석을 명시적으로 구성해야 합니다.

## 3. 정적 import와 동적 import

### 정적 import

remote가 항상 필요한 경우에는 정적 import를 사용합니다.

```tsx
import { RemoteApp } from '@mfe/catalog';

export function HostApp() {
  return <RemoteApp initial={0} />;
}
```

서버에서는 Node loader가 이 specifier를 manifest entry의 `url`로 연결하고, 브라우저에서는 Import Map이 같은 specifier를 연결합니다.

### 동적 import

route 단위 분할이나 지연 로딩이 필요하면 동적 import를 사용할 수 있습니다.

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

정적 import와 동적 import 모두 같은 manifest entry를 사용할 수 있습니다. 다만 `React.lazy`는 지연 로딩 API이므로 `renderToString()`에서 remote가 반드시 SSR된다는 뜻은 아닙니다.

SSR 결과에 동적 remote를 반드시 포함해야 한다면 서버에서 remote를 먼저 로드한 뒤 React tree를 구성합니다.

```js
const { RemoteApp } = await import('@mfe/catalog');
// RemoteApp을 사용해 SSR tree를 구성합니다.
```

Suspense 기반 SSR이 필요하면 React의 streaming SSR API 또는 사용하는 프레임워크의 Suspense SSR 방식을 사용해야 합니다.

## 4. Browser Import Map API

manifest를 브라우저 Import Map으로 변환하거나 SSR HTML에 삽입할 수 있습니다.

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

React runtime처럼 remote manifest에 포함하지 않은 browser dependency를 추가해야 한다면 `createBrowserImportMap()` 결과를 확장한 뒤 `serializeImportMap()`을 사용합니다.

```js
const importMap = createBrowserImportMap(manifest);
importMap.imports.react = '/vendor/react.mjs';

const script = `<script type="importmap">${serializeImportMap(importMap)}</script>`;
```

Import Map은 module script보다 먼저 삽입되어야 합니다. 이미 다른 Import Map이 document에 있으면 브라우저에서 병합되지 않으므로 Host의 최종 HTML에서 하나의 Import Map으로 관리해야 합니다.

## 5. Next.js bundler 연동

Next.js 연동은 브라우저 Import Map을 대체하지 않습니다. Next.js webpack과 Turbopack이 remote 파일을 번들에서 해석하도록 alias를 추가합니다.

```text
Next.js webpack/Turbopack
  -> local remote entry alias
  -> Next.js server/client bundle
```

따라서 Next.js 페이지에서 사용하는 import는 브라우저가 HTML의 Import Map으로 해석하는 것이 아니라 Next.js bundler가 처리합니다. Native Import Map이 필요한 별도 module script가 있다면 `@mfe-ssr/import-map`으로 직접 삽입해야 합니다.

### 5.1 설치

```sh
pnpm add @mfe-ssr/next
```

### 5.2 설정

`url`에는 Next.js bundler가 읽을 수 있는 로컬 파일 경로를 전달합니다. CDN URL을 그대로 전달하는 브라우저 Import Map manifest와는 용도가 다릅니다.

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

remote가 Next.js 프로젝트 외부에 있다면 output tracing root 또는 Next.js가 해당 파일을 읽을 수 있는 workspace 설정도 필요할 수 있습니다.

### 5.3 페이지에서 사용

Hooks나 Context를 사용하는 remote는 client component boundary 안에서 사용합니다.

```tsx
// app/page.tsx
'use client';

import { RemoteApp } from '@mfe/catalog';

export default function Page() {
  return <RemoteApp initial={0} />;
}
```

`withNextRemoteEntries()`는 webpack과 Turbopack 양쪽에 같은 alias를 설정합니다. remote는 Next.js 전용 `server`/`client` 파일을 제공할 필요가 없지만, Next.js가 읽을 수 있는 파일 경로와 Native ESM build 결과물은 준비되어 있어야 합니다.

## 6. Manifest

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

`/`로 끝나는 specifier와 URL은 하위 경로까지 연결합니다.

```ts
{
  '@mfe/ui/': {
    id: '@mfe/ui',
    version: '1.0.0',
    url: 'https://cdn.example.com/ui/',
  },
}
```

위 설정에서 `@mfe/ui/button`은 `https://cdn.example.com/ui/button`으로 해석됩니다.

### Scope

`scopes`를 사용하면 importing module의 URL에 따라 mapping을 다르게 적용할 수 있습니다.

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

`integrity`는 브라우저 Import Map과 Node remote fetch에 사용할 SRI metadata입니다. 실제 배포 파일의 digest를 생성해 입력해야 합니다.

```ts
{
  id: '@mfe/catalog',
  version: '1.0.0',
  url: 'https://cdn.example.com/catalog/catalog.mjs',
  // 실제 배포 파일의 SRI digest를 입력합니다.
  integrity: 'sha384-<base64-digest>',
}
```

### Manifest 검증

manifest entry에는 `id`, `version`, `url`이 필요합니다. URL, prefix mapping, scope, integrity 형식은 `validateManifest()`가 검증합니다.

## 7. API reference

### `@mfe-ssr/core`

- `RemoteManifest`: remote mapping을 표현하는 manifest 타입
- `ImportMap`: 브라우저 Import Map 타입
- `validateManifest()`: manifest 구조와 URL 검증
- `ManifestError`: manifest 검증 오류
- `createManifestResolver()`: manifest 기반 specifier resolver
- `toImportMap()`: manifest를 브라우저 Import Map 객체로 변환

### `@mfe-ssr/import-map`

- `createBrowserImportMap()`: manifest를 Import Map 객체로 변환
- `createImportMapScript()`: SSR HTML에 삽입할 Import Map script 생성
- `serializeImportMap()`: Import Map 객체를 안전한 JSON 문자열로 변환
- `createModulePreloadLinks()`: 선택한 remote의 modulepreload link 생성
- `injectImportMap()`: 브라우저 document에 Import Map 삽입

### `@mfe-ssr/node`

- `createNodeResolver()`: Node.js 코드에서 remote URL 직접 해석
- `registerNodeLoader()`: 이후에 로드되는 import가 manifest를 사용하도록 Node loader 등록
- `RemoteModuleFetcher`: HTTP remote fetch, integrity 검증, cache 처리
- `checkRemoteHealth()`: remote endpoint 상태 확인

`registerNodeLoader()`는 호출 이후에 로드되는 모듈에 적용됩니다. 같은 파일에서 loader 등록보다 앞서 실행되는 static import에는 적용되지 않으므로, Host import는 loader 등록 뒤에 `await import()`로 실행해야 합니다.

HTTP(S) remote를 사용할 때는 `allowedOrigins`에 허용할 origin을 명시해야 합니다. 기본값은 빈 목록이므로, 허용되지 않은 origin은 fetch되지 않습니다. `timeoutMs`, `maxResponseBytes`, `cache`, `onDiagnostic`으로 fetch와 관찰성 정책을 조정할 수 있습니다.

```js
registerNodeLoader(manifest, {
  allowedOrigins: ['https://cdn.example.com'],
  timeoutMs: 5_000,
  maxResponseBytes: 1024 * 1024,
});
```

### `@mfe-ssr/next`

- `withNextRemoteEntries()`: Next.js webpack/Turbopack에 local remote entry alias 연결

## 8. 운영 전 확인 사항

### Remote 배포

- remote entry가 Native ESM으로 빌드되어 있는가
- 브라우저와 SSR 서버가 remote URL에 접근할 수 있는가
- 브라우저에서 remote를 다른 origin으로 로드한다면 CORS가 설정되어 있는가
- remote와 Host가 호환되는 React runtime을 사용하는가
- HTTP(S) remote가 import하는 bare dependency를 bundle했거나 manifest에 mapping했는가
- remote가 import하는 하위 module과 asset도 함께 배포되어 있는가

### Host build

- client/server bundle에서 remote specifier가 보존되는가
- Vite/Rollup의 `external` 설정이 client와 server 양쪽에 적용되는가
- Import Map이 module script보다 먼저 HTML에 삽입되는가
- SSR과 hydration에 같은 props와 초기 데이터를 사용하는가

### 보안과 안정성

- 운영 환경에서 HTTPS remote URL을 사용하는가
- 필요한 경우 `integrity`를 설정했는가
- remote fetch timeout, cache, 장애 대응 정책이 있는가
- manifest version과 remote 배포 버전을 함께 관리하는가

## 9. 현재 제한 사항

- React remote의 SSR과 hydration을 우선 지원합니다.
- Node.js `>=20.6` ESM loader를 사용합니다.
- 정적 import와 동적 import 모두 같은 manifest entry를 사용할 수 있습니다.
- Host 번들러의 remote `external` 설정은 직접 해야 합니다.
- `React.lazy`만으로 `renderToString()`의 동적 remote SSR이 보장되지는 않습니다. 필요한 경우 서버에서 remote를 먼저 로드하거나 streaming SSR을 사용해야 합니다.
- CSS, 이미지 등 JavaScript 이외의 remote asset pipeline은 제공하지 않습니다.
- 초기 버전에서는 API와 manifest 형식이 변경될 수 있습니다.
