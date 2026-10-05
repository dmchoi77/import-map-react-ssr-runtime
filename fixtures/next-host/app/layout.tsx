import type { ReactNode } from 'react';

import { createBrowserImportMap, serializeImportMap } from '@mfe-ssr/import-map';

const clientManifest = {
  imports: {
    '@mfe/basic/counter': {
      id: '@mfe/basic/counter',
      version: '1.0.0',
      client: '/remote/counter.client.mjs',
      server: '/remote/counter.server.mjs',
    },
    '@mfe/basic/badge': {
      id: '@mfe/basic/badge',
      version: '1.0.0',
      client: '/remote/badge.client.mjs',
      server: '/remote/badge.server.mjs',
    },
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          type="importmap"
          dangerouslySetInnerHTML={{
            __html: serializeImportMap(createBrowserImportMap(clientManifest)),
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
