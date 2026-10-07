# TanStack Start 예제

이 예제는 TanStack Start Host가 Native ESM Remote를 정적으로 import하고,
브라우저에서는 Import Map으로 같은 Remote를 해석하는 구성을 보여줍니다.

TanStack Start가 제공하는 document SSR과 hydration을 그대로 사용하므로
Host에서 `hydrateRoot()`나 별도 SSR 서버를 직접 작성하지 않습니다. Root route가
Import Map을 HTML head에 삽입하고, Host 서버 entry가 production에서 Remote의
Native ESM 파일을 `/remote/remote.mjs`로 제공합니다.

## 실행

개발 서버를 실행합니다.

```sh
pnpm install
pnpm dev:example:tanstack-start
```

브라우저에서 [http://localhost:5230](http://localhost:5230)을 엽니다.
Remote 버튼을 누르면 hydration 이후 상태가 변경되고, `Details` 링크를 누르면
TanStack Router의 client navigation이 동작합니다.

production build는 다음과 같이 실행합니다.

```sh
pnpm build:example:tanstack-start
pnpm start:example:tanstack-start
```

## 구조

```text
examples/tanstack-start/
├─ host/
│  ├─ src/routes/__root.tsx  # 문서 shell과 Import Map
│  ├─ src/routes/index.tsx    # Remote를 렌더링하는 홈 route
│  ├─ src/routes/details.tsx  # SSR/client navigation 검증 route
│  ├─ src/router.tsx          # TanStack Router factory
│  ├─ src/server.ts           # production Remote entry 응답과 Start handler
│  └─ vite.config.ts          # Start, React, Nitro, Remote resolver 설정
└─ remote/
   ├─ src/remote-app.tsx      # Native ESM Remote entry
   ├─ manifest.mjs            # 브라우저 Import Map manifest
   └─ vite.*.config.ts        # production/dev Remote build 설정
```

개발 환경에서는 Host의 Vite resolver가 서버에서는 Remote 소스 파일을 직접
해석하고, 브라우저에서는 Remote Vite 서버 URL을 module specifier에 연결합니다.
production에서는 Host의 Start server entry가 빌드된 Remote 파일을 응답합니다.
