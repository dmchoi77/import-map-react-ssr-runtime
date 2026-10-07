import { useState } from 'react';

export interface RemoteAppProps {
  initial?: number;
}

export function RemoteApp({ initial = 0 }: RemoteAppProps) {
  const [count, setCount] = useState(initial);

  return (
    <section data-remote="react-vite">
      <h1>Vite React remote</h1>
      <p>This component was rendered by a remote Native ESM entry.</p>
      <button
        id="react-vite-remote-increment"
        type="button"
        onClick={() => setCount((value) => value + 1)}
      >
        Remote count: {count}
      </button>
    </section>
  );
}

export default RemoteApp;
