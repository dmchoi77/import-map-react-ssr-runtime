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

  it('keeps concurrent render roots and hydration contracts isolated', async () => {
    interface RequestProps {
      requestId: string;
      value: number;
    }

    const requestRemote: ReactRemoteModule<RequestProps> = {
      default: ({ requestId, value }) =>
        createElement('output', { 'data-request-id': requestId }, `${requestId}:${value}`),
    };
    const requests = Array.from({ length: 24 }, (_, index) => ({
      requestId: `request-${index}`,
      value: index,
    }));

    const rendered = await Promise.all(
      requests.map(async (props) => {
        await new Promise<void>((resolve) => setImmediate(resolve));
        return renderReactRemote({
          specifier: '@mfe/concurrent',
          remote: requestRemote,
          props,
        });
      }),
    );

    const rootIds = rendered.map((markup) => {
      const match = markup.match(/<div id="([^"]+)" data-mfe-react-root=/);
      expect(match).not.toBeNull();
      return match![1];
    });
    expect(new Set(rootIds).size).toBe(requests.length);

    rendered.forEach((markup, index) => {
      const rootId = rootIds[index];
      const contractMatch = markup.match(
        /<script type="application\/json" data-mfe-react-hydration="([^"]+)">(.*?)<\/script>/,
      );
      expect(contractMatch).not.toBeNull();
      expect(contractMatch![1]).toBe(rootId);
      expect(markup).toContain(`data-request-id="${requests[index].requestId}"`);

      const contract = JSON.parse(contractMatch![2]);
      expect(contract).toEqual({
        specifier: '@mfe/concurrent',
        props: requests[index],
        identifierPrefix: `${rootId}-`,
      });
    });
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
