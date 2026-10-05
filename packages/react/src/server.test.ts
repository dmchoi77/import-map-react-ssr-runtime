import { createElement, useId } from 'react';
import { describe, expect, it } from 'vitest';

import { renderReactRemote } from './server';
import { createReactRootMarker } from './types';
import type { ReactRemoteModule } from './types';

interface GreetingProps {
  name: string;
}

const remote: ReactRemoteModule<GreetingProps> = {
  default: ({ name }) => createElement('p', { id: 'greeting' }, `Hello ${name}`),
  metadata: {
    id: '@mfe/greeting',
    version: '1.0.0',
  },
};

describe('renderReactRemote', () => {
  it('defines a stable marker for the host-owned root container', () => {
    expect(createReactRootMarker('greeting-root')).toEqual({
      attribute: 'data-mfe-react-root',
      value: 'greeting-root',
    });
  });

  it('renders the remote default component to HTML', () => {
    const result = renderReactRemote({
      remote,
      props: { name: 'Ada' },
      rootId: 'greeting-root',
    });

    expect(result).toEqual({
      html: '<p id="greeting">Hello Ada</p>',
      rootId: 'greeting-root',
      stateScript: undefined,
    });
  });

  it('serializes optional state next to the rendered remote', () => {
    const result = renderReactRemote({
      remote,
      props: { name: 'Ada' },
      rootId: 'greeting-root',
      state: { greeting: 'Hello Ada' },
    });

    expect(result.stateScript).toBe(
      '<script type="application/json" data-mfe-state="greeting-root">{"greeting":"Hello Ada"}</script>',
    );
  });

  it('returns the identifierPrefix used to generate deterministic ids', () => {
    const idRemote: ReactRemoteModule = {
      default: () => {
        const id = useId();
        return createElement('label', { htmlFor: id }, createElement('input', { id }));
      },
    };

    const result = renderReactRemote({
      remote: idRemote,
      props: {},
      rootId: 'id-root',
      identifierPrefix: 'greeting-',
    });

    expect(result.identifierPrefix).toBe('greeting-');
    expect(result.html).toContain('greeting-');
  });

  it('reports rendering and serialization failures through onError', () => {
    const errors: unknown[] = [];

    expect(() =>
      renderReactRemote({
        remote,
        props: { name: 'Ada' },
        rootId: 'greeting-root',
        state: BigInt(1),
        onError: (error) => errors.push(error),
      }),
    ).toThrowError(/State must be JSON serializable/);

    expect(errors).toHaveLength(1);
  });
});
