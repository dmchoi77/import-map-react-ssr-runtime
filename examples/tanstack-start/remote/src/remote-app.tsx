import { useState } from 'react';

export interface RemoteAppProps {
  readonly initial?: number;
}

export function RemoteApp({ initial = 0 }: RemoteAppProps) {
  const [count, setCount] = useState(initial);

  return (
    <section data-remote="tanstack-start">
      <h2>TanStack Start remote</h2>
      <p>This component was rendered by a remote Native ESM entry.</p>
      <button
        id="tanstack-start-remote-increment"
        type="button"
        onClick={() => setCount((current) => current + 1)}
      >
        Remote count: {count}
      </button>
    </section>
  );
}

export default RemoteApp;
