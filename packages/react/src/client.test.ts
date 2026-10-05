// @vitest-environment happy-dom

import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { hydrateReactRemote } from './client';
import type { ReactRemoteModule } from './types';

interface GreetingProps {
  name: string;
}

const remote: ReactRemoteModule<GreetingProps> = {
  default: ({ name }) => createElement('p', null, `Hello ${name}`),
};

describe('hydrateReactRemote', () => {
  it('hydrates a remote component into an existing root', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>Hello Ada</p>';
    document.body.append(root);

    const hydratedRoot = hydrateReactRemote({
      remote,
      root,
      props: { name: 'Ada' },
      identifierPrefix: 'greeting-',
    });

    expect(hydratedRoot).toEqual(
      expect.objectContaining({
        render: expect.any(Function),
        unmount: expect.any(Function),
      }),
    );

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    hydratedRoot.unmount();
    expect(root.innerHTML).toBe('');
  });

  it('reports a server/client markup mismatch through onRecoverableError', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>Hello Grace</p>';
    document.body.append(root);
    const errors: unknown[] = [];

    const hydratedRoot = hydrateReactRemote({
      remote,
      root,
      props: { name: 'Ada' },
      onRecoverableError: (error) => errors.push(error),
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(errors).toHaveLength(1);
    hydratedRoot.unmount();
  });
});
