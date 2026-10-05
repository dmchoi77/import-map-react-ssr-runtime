import { useState } from 'react';

export interface CounterProps {
  initial?: number;
}

export function Counter({ initial = 0 }: CounterProps) {
  const [count, setCount] = useState(initial);

  return (
    <section data-remote="counter">
      <h1>Counter remote</h1>
      <button id="counter-increment" type="button" onClick={() => setCount((value) => value + 1)}>
        Count: {count}
      </button>
    </section>
  );
}
