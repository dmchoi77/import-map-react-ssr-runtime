import { createElement, useState } from 'react';

export default function CounterRemote({ initial }) {
  const [count, setCount] = useState(initial);

  return createElement(
    'button',
    {
      id: 'counter-increment',
      type: 'button',
      onClick: () => setCount((current) => current + 1),
    },
    'Count: ',
    count,
  );
}
