# React Router 예제

이 예제는 React Router를 사용하는 Host와 Native ESM으로 빌드된 Remote를 함께 실행합니다.
Host는 서버에서 `StaticRouter`로 현재 URL을 SSR하고, 브라우저에서는 같은 트리를
`BrowserRouter`로 hydration합니다. Remote는 Host 코드에서 정적으로 import하지만,
브라우저에서는 HTML에 삽입된 Import Map이 Remote URL을 해석합니다.

## 실행

저장소 루트에서 다음 명령을 실행합니다.

```sh
pnpm install
pnpm dev:example:react-router
```

브라우저에서 [http://localhost:5220](http://localhost:5220)을 엽니다.
`Details` 링크로 이동하면 서버가 `/details` 경로를 SSR하고, 새로고침 뒤에도
React Router가 같은 경로를 유지합니다. Remote의 버튼을 눌러 hydration 이후 상태가
동작하는지도 확인할 수 있습니다.

production build는 다음과 같이 실행합니다.

```sh
pnpm build:example:react-router
pnpm start:example:react-router
```

## 구조

```text
examples/react-router/
├─ host/
│  ├─ src/App.tsx                 # Routes와 RemoteApp을 조합하는 Host
│  ├─ src/app.server.tsx          # 서버 렌더링 entry
│  ├─ src/app.client.tsx          # BrowserRouter hydration entry
│  ├─ src/react-router-server.mjs # 개발/production 공통 SSR handler
│  ├─ server.mjs                  # production Node 실행 entry
│  └─ vite.*.config.ts            # client/server/dev build 설정
└─ remote/
   ├─ src/remote-app.tsx          # Native ESM Remote entry
   ├─ manifest.mjs                # 서버 resolver와 브라우저 Import Map manifest
   └─ vite.*.config.ts            # production/dev Remote build 설정
```

Host의 서버 번들은 `@mfe-ssr/node`를 통해 Remote를 Node.js 모듈로 해석합니다.
브라우저의 Host 번들은 React runtime을 Import Map으로 external 처리하고,
React Router 자체는 Host client bundle에 포함합니다. 따라서 예제의 핵심 계약은
React Router가 아니라 `@example/react-router/remote`라는 하나의 module specifier를
서버와 브라우저에서 각각 해석하는 것입니다.
