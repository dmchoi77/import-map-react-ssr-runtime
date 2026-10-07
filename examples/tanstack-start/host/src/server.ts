import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import handler, { createServerEntry } from '@tanstack/react-start/server-entry';

const remoteEntryPath = resolve(process.cwd(), '../remote/dist/remote.mjs');

export default createServerEntry({
  async fetch(request) {
    if (new URL(request.url).pathname === '/remote/remote.mjs') {
      try {
        return new Response(await readFile(remoteEntryPath, 'utf8'), {
          headers: { 'content-type': 'text/javascript; charset=utf-8' },
        });
      } catch {
        return new Response('Remote entry was not built.', { status: 404 });
      }
    }

    return handler.fetch(request);
  },
});
