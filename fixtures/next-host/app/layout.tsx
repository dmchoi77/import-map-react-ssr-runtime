import type { ReactNode } from 'react';

import { createBrowserImportMap, serializeImportMap } from '@mfe-ssr/import-map';

const browserManifest = {
  imports: {
    '@mfe/basic/counter': {
      id: '@mfe/basic/counter',
      version: '1.0.0',
      url: '/remote/counter.mjs',
    },
    '@mfe/basic/badge': {
      id: '@mfe/basic/badge',
      version: '1.0.0',
      url: '/remote/badge.mjs',
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
            __html: serializeImportMap(createBrowserImportMap(browserManifest)),
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
