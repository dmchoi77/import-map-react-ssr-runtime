import { useState } from 'react';

export interface CounterState {
  count: number;
}

export interface CounterProps {
  label: string;
  state?: CounterState;
}

export interface ProfileProps {
  name: string;
}

export function Counter({ label, state }: CounterProps) {
  const [count, setCount] = useState(state?.count ?? 0);

  return (
    <section data-remote="counter">
      <h2>{label}</h2>
      <button
        id="counter-increment"
        type="button"
        onClick={() => setCount((current) => current + 1)}
      >
        Count: {count}
      </button>
    </section>
  );
}

export function Profile({ name }: ProfileProps) {
  return (
    <article data-remote="profile">
      <h2>Profile</h2>
      <p>{name}</p>
    </article>
  );
}

export function FixtureApp() {
  return (
    <main>
      <Counter label="Counter" state={{ count: 0 }} />
      <Profile name="Ada Lovelace" />
    </main>
  );
}
