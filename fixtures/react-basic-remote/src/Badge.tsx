import { useState } from 'react';

export function Badge() {
  const [clicks, setClicks] = useState(0);

  return (
    <aside data-remote="badge">
      <span>Nested child remote</span>
      <button id="badge-toggle" type="button" onClick={() => setClicks((value) => value + 1)}>
        Child clicks: {clicks}
      </button>
    </aside>
  );
}
