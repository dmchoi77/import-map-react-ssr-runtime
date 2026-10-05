'use client';

import { RemoteApp } from '@mfe/basic/counter';

export default function Page() {
  return (
    <main>
      <div id="app-root">
        <output id="host-status">Next SSR ready</output>
        <RemoteApp initial={0} />
      </div>
    </main>
  );
}
