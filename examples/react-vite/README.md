# React + Vite example

이 예제는 하나의 React Host가 Vite로 빌드된 Native ESM remote를 다음 순서로 사용하는 최소 실행 예제입니다.

1. Node.js에서 remote를 해석해 Host React tree를 SSR합니다.
2. SSR HTML에 브라우저 Import Map을 삽입합니다.
3. 브라우저가 같은 Host tree를 `hydrateRoot()`로 hydration합니다.
4. hydration 이후 remote의 React state가 동작하는지 확인합니다.

## 실행

저장소 루트에서 의존성을 설치한 뒤 실행합니다.

```sh
pnpm install
pnpm dev:example:react-vite
```

브라우저에서 [http://localhost:5210](http://localhost:5210)을 엽니다.

production build 결과를 실행하려면 다음을 사용합니다.

```sh
pnpm build:example:react-vite
pnpm start:example:react-vite
```

## 구조

```text
examples/react-vite/
├─ host/
│  ├─ src/App.tsx              # remote를 정적으로 import하는 Host
│  ├─ src/app.server.tsx       # SSR entry
│  ├─ src/app.client.tsx       # hydration entry
│  ├─ src/react-vite-server.mjs # Vite dev middleware와 production SSR 공통 handler
│  ├─ server.mjs               # production 실행 entry
│  └─ vite.*.config.ts         # client/server/dev build 설정
├─ remote/
│  ├─ src/remote-app.tsx       # Native ESM remote entry
│  ├─ manifest.mjs             # Node resolver와 Browser Import Map의 공통 manifest
│  └─ vite.*.config.ts         # production/dev remote build 설정
└─ host/vite-import-map-react.ts와 remote/vite-import-map-react.ts
                               # Vite client build의 React external 처리
```

Host와 remote는 각각 별도의 workspace package입니다. Host는
`@example/react-vite/remote`를 import하고, 서버에서는
`@mfe-ssr/node`의 `registerNodeLoader()`가 manifest URL로 연결합니다. 브라우저에서는
같은 manifest가 Import Map으로 삽입되어 같은 specifier를 remote URL로 연결합니다.

개발 환경에서는 Vite custom server가 SSR middleware를 실행하고, production에서는
동일한 SSR handler를 최소한의 Node 실행 entry가 사용합니다. 따라서 두 환경에서
SSR 계약은 공유하면서 production은 Vite runtime에 의존하지 않습니다.

이 예제는 React Hooks를 사용하는 remote를 보여주기 때문에 Host와 remote가 호환되는
React runtime을 사용해야 합니다. 브라우저에서는 예제를 단순하게 유지하기 위해 React
runtime을 `esm.sh` Import Map URL로 연결합니다.
