import { finished } from 'node:stream/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createElement, lazy, Suspense, useId } from 'react';
import { describe, expect, it } from 'vitest';

import {
  renderReactRemoteBySpecifier,
  renderReactRemote,
  renderReactRemoteBySpecifierToStream,
  renderReactRemoteToStream,
} from './server';
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

  it('reports render outcomes without copying specifiers or props into diagnostics', () => {
    const events: unknown[] = [];
    const markup = renderReactRemote({
      specifier: '@mfe/greeting?token=private',
      remote,
      props: { name: 'private-prop' },
      onDiagnostic: (event) => events.push(event),
    });

    expect(markup).toContain('private-prop');
    expect(events).toMatchObject([
      {
        phase: 'render',
        outcome: 'success',
        remoteId: '@mfe/greeting',
        durationMs: expect.any(Number),
        timestamp: expect.any(String),
      },
    ]);
    expect(JSON.stringify(events)).not.toContain('private-prop');
    expect(JSON.stringify(events)).not.toContain('@mfe/greeting?token=private');
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
    const events: unknown[] = [];
    expect(() =>
      renderReactRemote({
        specifier: ' ',
        remote,
        props: { name: 'Ada' },
        rootId: 'root',
        onDiagnostic: (event) => events.push(event),
      }),
    ).toThrowError(/specifier/);
    expect(events).toMatchObject([
      { phase: 'render', outcome: 'failure', errorCode: 'RENDER_FAILED' },
    ]);
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
  it('reports completion and remote metadata for streamed rendering', async () => {
    const events: unknown[] = [];
    const stream = renderReactRemoteToStream({
      specifier: '@mfe/greeting',
      remote,
      props: { name: 'Ada' },
      onDiagnostic: (event) => events.push(event),
    });

    for await (const _chunk of stream) {
      // Consume the stream so completion diagnostics can fire.
    }

    expect(events).toMatchObject([
      { phase: 'render', outcome: 'success', remoteId: '@mfe/greeting' },
    ]);
  });

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
    const events: unknown[] = [];
    const failingRemote: ReactRemoteModule = {
      default: () => {
        throw new Error('remote render failed');
      },
    };
    const stream = renderReactRemoteToStream({
      specifier: '@mfe/failing',
      remote: failingRemote,
      props: {},
      onDiagnostic: (event) => events.push(event),
    });

    await expect(finished(stream)).rejects.toThrow('remote render failed');
    expect(events).toMatchObject([
      { phase: 'render', outcome: 'failure', errorCode: 'RENDER_FAILED' },
    ]);
  });
});

describe('renderReactRemoteBySpecifierToStream', () => {
  it('renders a remote by specifier without exposing stream handling', async () => {
    const markup = await renderReactRemoteBySpecifier<GreetingProps>({
      specifier: '@mfe/greeting',
      props: { name: 'Ada' },
      rootId: 'specifier-string-root',
      loadRemote: async () => remote,
    });

    expect(markup).toContain('Hello Ada');
    expect(markup).toContain('data-mfe-react-root="specifier-string-root"');
    expect(markup).toContain('"specifier":"@mfe/greeting"');
  });

  it('reports remote load failure and completed fallback as separate outcomes', async () => {
    const events: unknown[] = [];
    const stream = renderReactRemoteBySpecifierToStream<GreetingProps>({
      specifier: '@mfe/private?token=never-log',
      props: { name: 'private-prop' },
      loadRemote: async () => {
        throw new Error('private loader error');
      },
      onDiagnostic: (event) => events.push(event),
    });

    for await (const _chunk of stream) {
      // Consume the fallback stream.
    }

    expect(events).toMatchObject([
      { phase: 'resolve', outcome: 'failure', errorCode: 'REMOTE_LOAD_FAILED' },
      { phase: 'render', outcome: 'success' },
    ]);
    expect(JSON.stringify(events)).not.toContain('private-prop');
    expect(JSON.stringify(events)).not.toContain('never-log');
    expect(JSON.stringify(events)).not.toContain('private loader error');
  });

  it('does not start a remote loader if the request aborts before its first microtask', async () => {
    const controller = new AbortController();
    let loaderCalls = 0;
    const stream = renderReactRemoteBySpecifierToStream<GreetingProps>({
      specifier: '@mfe/aborted',
      props: { name: 'Ada' },
      signal: controller.signal,
      loadRemote: () => {
        loaderCalls += 1;
        return new Promise<ReactRemoteModule<GreetingProps>>(() => {});
      },
    });
    const completion = finished(stream);
    controller.abort();

    await expect(completion).rejects.toMatchObject({ name: 'AbortError' });
    expect(loaderCalls).toBe(0);
  });

  it('uses native server module resolution when no custom loader is provided', async () => {
    const specifier = pathToFileURL(
      resolve(process.cwd(), 'packages/react/src/fixtures/counter-remote.mjs'),
    ).href;
    const stream = renderReactRemoteBySpecifierToStream({
      specifier,
      props: { initial: 7 },
      rootId: 'native-import-root',
    });
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const markup = Buffer.concat(chunks).toString();

    expect(markup).toContain('Count: 7');
    expect(markup).toContain('"specifier":"file:');
    expect(markup).toContain('"suspense":{"fallback":"Loading remote"');
  });

  it('streams a fallback while the adapter resolves a delayed remote by specifier', async () => {
    const stream = renderReactRemoteBySpecifierToStream({
      specifier: '@mfe/delayed',
      props: { name: 'Ada' },
      loadRemote: async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return remote;
      },
      fallback: 'Loading greeting',
      errorFallback: 'Greeting unavailable',
      timeoutMs: 1_000,
      rootId: 'specifier-root',
    });
    let firstChunk = '';
    const chunks: Buffer[] = [];
    let markFallbackSent: () => void = () => {};
    const fallbackSent = new Promise<void>((resolve) => {
      markFallbackSent = resolve;
    });
    stream.on('data', (chunk: Buffer) => {
      chunks.push(Buffer.from(chunk));
      if (!firstChunk && chunk.toString().includes('Loading greeting')) {
        firstChunk = chunk.toString();
        markFallbackSent();
      }
    });
    const completion = finished(stream);

    await fallbackSent;
    expect(firstChunk).toContain('Loading greeting');
    expect(firstChunk).not.toContain('Hello Ada');

    await completion;
    const markup = Buffer.concat(chunks).toString();

    expect(markup).toContain('Hello Ada');
    expect(markup).toContain('"fallback":"Loading greeting"');
    expect(markup).toContain('"errorFallback":"Greeting unavailable"');
    expect(markup).toContain('"timeoutMs":1000');
  });

  it('finishes with the configured server fallback when the remote import rejects', async () => {
    const stream = renderReactRemoteBySpecifierToStream({
      specifier: '@mfe/rejected',
      props: { name: 'Ada' },
      loadRemote: async () => {
        throw new Error('remote import rejected');
      },
      fallback: 'Loading greeting',
      errorFallback: 'Greeting unavailable',
      rootId: 'rejected-root',
    });

    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const markup = Buffer.concat(chunks).toString();

    expect(markup).toContain('Greeting unavailable');
    expect(markup).toContain('data-mfe-react-root="rejected-root"');
    expect(markup).toContain('"specifier":"@mfe/rejected"');
    expect(markup).toContain('"errorFallback":"Greeting unavailable"');
    expect(markup).toContain('"serverFallback":true');
  });

  it('times out a stalled remote load and still completes the fallback stream', async () => {
    let loadSignal: AbortSignal | undefined;
    let resolveLateRemote: (module: ReactRemoteModule<GreetingProps>) => void = () => {};
    const lateRemote = new Promise<ReactRemoteModule<GreetingProps>>((resolve) => {
      resolveLateRemote = resolve;
    });
    const stream = renderReactRemoteBySpecifierToStream<GreetingProps>({
      specifier: '@mfe/stalled',
      props: { name: 'Ada' },
      loadRemote: (_specifier, { signal }) => {
        loadSignal = signal;
        return lateRemote;
      },
      fallback: 'Loading greeting',
      errorFallback: 'Greeting timed out',
      timeoutMs: 20,
      rootId: 'timeout-root',
    });

    const startedAt = Date.now();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const markup = Buffer.concat(chunks).toString();

    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(markup).toContain('Greeting timed out');
    expect(markup).toContain('"timeoutMs":20');
    expect(markup).toContain('"errorFallback":"Greeting timed out"');
    expect(markup).toContain('"serverFallback":true');
    expect(loadSignal?.aborted).toBe(true);

    resolveLateRemote(remote);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(markup).not.toContain('Hello Ada');
  });
});
