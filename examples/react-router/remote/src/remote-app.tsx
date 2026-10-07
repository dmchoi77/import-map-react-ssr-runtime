import { useState } from 'react';

export interface RemoteAppProps {
  readonly initial?: number;
}

export function RemoteApp({ initial = 0 }: RemoteAppProps) {
  const [count, setCount] = useState(initial);

  return (
    <section data-remote="react-router">
      <h1>React Router remote</h1>
      <p>This component was rendered by a remote Native ESM entry.</p>
      <button
        id="react-router-remote-increment"
        type="button"
        onClick={() => setCount((current) => current + 1)}
      >
        Remote count: {count}
      </button>
    </section>
  );
}

export default RemoteApp;
