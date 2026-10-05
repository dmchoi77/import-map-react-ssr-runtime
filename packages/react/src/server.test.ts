import { finished } from 'node:stream/promises';

import { createElement, lazy, Suspense, useId } from 'react';
import { describe, expect, it } from 'vitest';

import { renderReactRemote, renderReactRemoteToStream } from './server';
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

describe('renderReactRemoteToStream', () => {
  it('streams a Suspense shell before delayed content and appends its hydration contract', async () => {
    const DelayedContent = lazy(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
      return {
        default: () => createElement('p', null, 'Remote content ready'),
      };
    });
    const suspenseRemote: ReactRemoteModule = {
      default: () =>
        createElement(
          'section',
          null,
          createElement('h1', null, 'Remote shell'),
          createElement(
            Suspense,
            { fallback: createElement('p', null, 'Loading remote') },
            createElement(DelayedContent),
          ),
        ),
    };
    const stream = renderReactRemoteToStream({
      specifier: '@mfe/delayed',
      remote: suspenseRemote,
      props: {},
      rootId: 'streamed-root',
    });
    const chunks: Buffer[] = [];
    let resolveShell: (markup: string) => void = () => {};
    const shell = new Promise<string>((resolve) => {
      resolveShell = resolve;
    });
    let partialMarkup = '';
    stream.on('data', (chunk: Buffer) => {
      chunks.push(Buffer.from(chunk));
      partialMarkup += chunk.toString();
      if (partialMarkup.includes('Loading remote')) resolveShell(partialMarkup);
    });

    const startedAt = Date.now();
    const shellMarkup = await shell;
    expect(Date.now() - startedAt).toBeLessThan(200);
    expect(shellMarkup).toContain('Remote shell');
    expect(shellMarkup).not.toContain('Remote content ready');

    await finished(stream);
    const markup = Buffer.concat(chunks).toString();
    expect(markup).toContain('<div id="streamed-root" data-mfe-react-root="streamed-root">');
    expect(markup).toContain('Remote content ready');
    expect(markup).toContain(
      'data-mfe-react-hydration="streamed-root">{"specifier":"@mfe/delayed","props":{},"identifierPrefix":"streamed-root-"}</script>',
    );
  });

  it('closes with an abort error when the caller cancels rendering', async () => {
    const controller = new AbortController();
    const NeverLoaded = lazy(() => new Promise<never>(() => {}));
    const suspenseRemote: ReactRemoteModule = {
      default: () =>
        createElement(
          'section',
          null,
          createElement('h1', null, 'Abort shell'),
          createElement(
            Suspense,
            { fallback: createElement('p', null, 'Loading forever') },
            createElement(NeverLoaded),
          ),
        ),
    };
    const stream = renderReactRemoteToStream({
      specifier: '@mfe/stalled',
      remote: suspenseRemote,
      props: {},
      signal: controller.signal,
    });
    const completion = finished(stream);
    let resolveFallback: () => void = () => {};
    const fallback = new Promise<void>((resolve) => {
      resolveFallback = resolve;
    });
    stream.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('Loading forever')) resolveFallback();
    });
    await fallback;
    controller.abort();

    await expect(completion).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('fails the stream when a remote throws during rendering', async () => {
    const failingRemote: ReactRemoteModule = {
      default: () => {
        throw new Error('remote render failed');
      },
    };
    const stream = renderReactRemoteToStream({
      specifier: '@mfe/failing',
      remote: failingRemote,
      props: {},
    });

    await expect(finished(stream)).rejects.toThrow('remote render failed');
  });
});
