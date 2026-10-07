import { useState } from 'react';

export interface RemoteAppProps {
  initial?: number;
}

export function RemoteApp({ initial = 0 }: RemoteAppProps) {
  const [count, setCount] = useState(initial);

  return (
    <section data-remote="next">
      <h1>Next.js remote</h1>
      <p>This component comes from a Vite-built Native ESM entry.</p>
      <button
        id="next-remote-increment"
        type="button"
        onClick={() => setCount((value) => value + 1)}
      >
        Remote count: {count}
      </button>
    </section>
  );
}

export default RemoteApp;
