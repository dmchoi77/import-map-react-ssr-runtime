/// <reference types="vite/client" />

import type { ReactNode } from 'react';

import { HeadContent, Link, Outlet, Scripts, createRootRoute } from '@tanstack/react-router';

import { createBrowserImportMap, serializeImportMap } from '@mfe-ssr/import-map';
import { createBrowserManifest } from '../../../remote/manifest.mjs';

const browserModules = {
  react: 'https://esm.sh/react@19.3.0',
  'react/jsx-runtime': 'https://esm.sh/react@19.3.0/jsx-runtime',
  'react-dom/client': 'https://esm.sh/react-dom@19.3.0/client?external=react',
};

const remoteEntry = import.meta.env.VITE_REMOTE_ENTRY ?? '/remote/remote.mjs';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'TanStack Start MFE SSR Example' },
    ],
  }),
  component: AppOutlet,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  const importMap = createBrowserImportMap(createBrowserManifest(remoteEntry));
  Object.assign(importMap.imports, browserModules);

  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          type="importmap"
          dangerouslySetInnerHTML={{ __html: serializeImportMap(importMap) }}
        />
      </head>
      <body>
        <output id="host-status">TanStack Start SSR ready</output>
        <nav aria-label="Primary navigation">
          <Link to="/" activeOptions={{ exact: true }}>
            Home
          </Link>
          {' | '}
          <Link id="details-link" to="/details">
            Details
          </Link>
        </nav>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

export function AppOutlet() {
  return <Outlet />;
}
