# Next.js example

이 예제는 Next.js App Router Host가 Vite로 빌드된 Native ESM remote를 Next.js
webpack 또는 Turbopack alias로 연결하는 실행 예제입니다.

Next.js 페이지의 정적 import는 브라우저 Import Map으로 해석되지 않습니다. 페이지를
빌드할 때 `@mfe-ssr/next`가 같은 remote entry를 server/client bundler에 연결하고,
Next.js가 SSR한 결과를 브라우저에서 hydration합니다.

## 실행

webpack 경로:

```sh
pnpm dev:example:next
```

Turbopack 경로:

```sh
pnpm dev:example:next:turbopack
```

production build:

```sh
pnpm build:example:next
pnpm start:example:next
```

## 구조

```text
examples/next/
├─ host/
│  ├─ app/page.tsx             # remote를 import하는 Next client component
│  ├─ next.config.mjs          # webpack/Turbopack remote alias 설정
│  └─ package.json
└─ remote/
   ├─ src/remote-app.tsx       # Vite Native ESM remote entry
   ├─ vite.config.ts
   └─ package.json
```

`next.config.mjs`의 `url`은 브라우저 CDN URL이 아니라 Next.js bundler가 읽을 수 있는
로컬 Native ESM 파일 경로입니다. 별도의 `client`/`server` remote entry는 필요하지
않습니다.
