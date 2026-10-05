import { createElement, useId } from 'react';
import { describe, expect, it } from 'vitest';

import { renderReactRemote } from './server';
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
  it('returns a self-describing root and serialized hydration contract', () => {
    const markup = renderReactRemote({
      specifier: '@mfe/greeting',
      remote,
      props: { name: 'Ada' },
      rootId: 'greeting-root',
    });

    expect(markup).toBe(
      '<div id="greeting-root" data-mfe-react-root="greeting-root"><p id="greeting">Hello Ada</p></div><script type="application/json" data-mfe-react-hydration="greeting-root">{"specifier":"@mfe/greeting","props":{"name":"Ada"},"identifierPrefix":"greeting-root-"}</script>',
    );
  });

  it('generates a root id when the caller does not need to manage one', () => {
    const markup = renderReactRemote({
      specifier: '@mfe/greeting',
      remote,
      props: { name: 'Ada' },
    });

    expect(markup).toMatch(/id="mfe-react-\d+" data-mfe-react-root="mfe-react-\d+"/);
  });

  it('uses the identifier prefix from the SSR contract to render deterministic ids', () => {
    const idRemote: ReactRemoteModule = {
      default: () => {
        const id = useId();
        return createElement('label', { htmlFor: id }, createElement('input', { id }));
      },
    };

    const markup = renderReactRemote({
      specifier: '@mfe/with-id',
      remote: idRemote,
      props: {},
      rootId: 'id-root',
      identifierPrefix: 'greeting-',
    });

    expect(markup).toContain('greeting-');
    expect(markup).toContain('"identifierPrefix":"greeting-"');
  });

  it('escapes the serialized props inside the hydration script', () => {
    const markup = renderReactRemote({
      specifier: '@mfe/greeting',
      remote,
      props: { name: '</script><script>alert(1)</script>' },
      rootId: 'greeting-root',
    });

    expect(markup).not.toContain('</script><script>alert(1)</script>');
    expect(markup).toContain('\\u003C/script\\u003E');
  });

  it('rejects invalid specifiers, root ids, and non-serializable props', () => {
    expect(() =>
      renderReactRemote({ specifier: ' ', remote, props: { name: 'Ada' }, rootId: 'root' }),
    ).toThrowError(/specifier/);
    expect(() =>
      renderReactRemote({
        specifier: '@mfe/greeting',
        remote,
        props: { name: 'Ada' },
        rootId: ' ',
      }),
    ).toThrowError(/rootId/);
    expect(() =>
      renderReactRemote({
        specifier: '@mfe/greeting',
        remote: remote as ReactRemoteModule<object>,
        props: { name: BigInt(1) } as unknown as GreetingProps,
      }),
    ).toThrowError(/JSON serializable/);
  });
});
