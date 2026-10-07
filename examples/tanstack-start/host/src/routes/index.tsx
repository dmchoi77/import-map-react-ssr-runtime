import { createFileRoute } from '@tanstack/react-router';

import { RemoteApp } from '@example/tanstack-start/remote';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <main>
      <h1>TanStack Start home</h1>
      <RemoteApp initial={0} />
    </main>
  );
}
