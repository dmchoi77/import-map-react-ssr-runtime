import { lazy, Suspense, useState } from 'react';

import { importNestedRemote } from './nested-remote-loader';

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

export interface DashboardProps {
  count: number;
  profileName: string;
}

function CounterUnavailable() {
  return <p data-mfe-child-fallback="counter">Counter unavailable</p>;
}

function ProfileUnavailable() {
  return <p data-mfe-child-fallback="profile">Profile unavailable</p>;
}

const CounterRemote = lazy(() =>
  importNestedRemote<typeof import('@mfe/fixture/counter')>('@mfe/fixture/counter').catch(() => ({
    default: CounterUnavailable,
  })),
);
const ProfileRemote = lazy(() =>
  importNestedRemote<typeof import('@mfe/fixture/profile')>('@mfe/fixture/profile').catch(() => ({
    default: ProfileUnavailable,
  })),
);

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

export function Dashboard({ count, profileName }: DashboardProps) {
  return (
    <section data-remote="dashboard">
      <h1>Nested remote dashboard</h1>
      <Suspense fallback={<p>Loading counter</p>}>
        <CounterRemote label="Nested Counter" state={{ count }} />
      </Suspense>
      <Suspense fallback={<p>Loading profile</p>}>
        <ProfileRemote name={profileName} />
      </Suspense>
    </section>
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
