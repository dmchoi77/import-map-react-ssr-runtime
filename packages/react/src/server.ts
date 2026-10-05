import { PassThrough, Writable } from 'node:stream';
import type { Readable } from 'node:stream';

import { createElement, lazy, Suspense } from 'react';
import type { ComponentType } from 'react';
import { renderToPipeableStream, renderToString } from 'react-dom/server';

import { createHydrationScript } from './serialize';
import { loadWithTimeout } from './load';
import { createReactRootMarker } from './types';
import type {
  ReactHydrationContract,
  ReactRemoteModule,
  ReactRemoteSuspenseContract,
} from './types';

export interface RenderReactRemoteOptions<Props extends object> {
  specifier: string;
  remote: ReactRemoteModule<Props>;
  props: Props;
  rootId?: string;
  identifierPrefix?: string;
}

export interface RenderReactRemoteStreamOptions<
  Props extends object,
> extends RenderReactRemoteOptions<Props> {
  signal?: AbortSignal;
}

export interface RenderReactRemoteBySpecifierStreamOptions<Props extends object> {
  specifier: string;
  props: Props;
  rootId?: string;
  identifierPrefix?: string;
  fallback?: string;
  errorFallback?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  loadRemote?: (
    specifier: string,
    options: { signal?: AbortSignal },
  ) => Promise<ReactRemoteModule<Props>>;
}

let nextGeneratedRootId = 0;

export function renderReactRemote<Props extends object>(
  options: RenderReactRemoteOptions<Props>,
): string {
  const prepared = prepareReactRemote(options);
  const html = renderToString(prepared.element, {
    identifierPrefix: prepared.identifierPrefix,
  });

  return `${prepared.openingTag}${html}${prepared.createClosingMarkup()}`;
}

export function renderReactRemoteToStream<Props extends object>(
  options: RenderReactRemoteStreamOptions<Props>,
): Readable {
  const prepared = prepareReactRemote(options);
  return renderPreparedReactRemoteToStream(prepared, options.signal);
}

export function renderReactRemoteBySpecifierToStream<Props extends object>(
  options: RenderReactRemoteBySpecifierStreamOptions<Props>,
): Readable {
  const suspense: ReactRemoteSuspenseContract = {
    fallback: options.fallback ?? 'Loading remote',
    errorFallback: options.errorFallback ?? 'Remote unavailable',
    timeoutMs: options.timeoutMs ?? 10_000,
    serverFallback: false,
  };
  validateRemoteLoadOptions(options, suspense);

  const Remote = lazy(async () => {
    try {
      const remote = await loadWithTimeout(
        (signal) =>
          options.loadRemote
            ? options.loadRemote(options.specifier, { signal })
            : (import(/* @vite-ignore */ options.specifier) as Promise<ReactRemoteModule<Props>>),
        suspense.timeoutMs,
        options.signal,
      );
      return { default: remote.default };
    } catch {
      suspense.serverFallback = true;
      return {
        default: (() =>
          createElement(
            'p',
            { 'data-mfe-fallback': 'server' },
            suspense.errorFallback,
          )) as ComponentType<Props>,
      };
    }
  });
  const suspenseRemote: ReactRemoteModule<Props> = {
    default: ((props: Props) =>
      createElement(
        Suspense,
        { fallback: createElement('p', null, suspense.fallback) },
        createElement(Remote, props),
      )) as ComponentType<Props>,
  };
  const prepared = prepareReactRemote({
    ...options,
    remote: suspenseRemote,
    suspense,
  });

  return renderPreparedReactRemoteToStream(prepared, options.signal);
}

function renderPreparedReactRemoteToStream(
  prepared: PreparedReactRemote,
  signal: AbortSignal | undefined,
): Readable {
  const output = new PassThrough();
  let reactStream: ReturnType<typeof renderToPipeableStream> | undefined;
  let rootWritten = false;
  let finishedNormally = false;
  let failed = false;

  const cleanup = () => signal?.removeEventListener('abort', abort);
  const fail = (reason: unknown) => {
    if (failed || output.destroyed) return;
    failed = true;
    output.destroy(toError(reason));
    reactStream?.abort();
  };
  const abort = () => {
    const error = new Error('React remote rendering was aborted.');
    error.name = 'AbortError';
    fail(error);
  };
  const writeOutput = (chunk: string | Buffer, callback: (error?: Error | null) => void) => {
    if (output.destroyed) {
      callback(new Error('React remote output stream is closed.'));
      return;
    }
    if (output.write(chunk)) {
      callback();
    } else {
      output.once('drain', callback);
    }
  };
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      if (rootWritten) {
        writeOutput(chunk, callback);
        return;
      }

      rootWritten = true;
      writeOutput(Buffer.concat([Buffer.from(prepared.openingTag), chunk]), callback);
    },
    final(callback) {
      const finish = () => {
        finishedNormally = true;
        output.end(prepared.createClosingMarkup());
        callback();
      };

      if (rootWritten) {
        finish();
        return;
      }

      rootWritten = true;
      writeOutput(prepared.openingTag, (error) => {
        if (error) {
          callback(error);
          return;
        }
        finish();
      });
    },
    destroy(error, callback) {
      if (error) fail(error);
      callback(error);
    },
  });

  output.once('close', () => {
    cleanup();
    if (!finishedNormally && !failed) reactStream?.abort();
  });

  if (signal?.aborted) {
    queueMicrotask(abort);
    return output;
  }
  signal?.addEventListener('abort', abort, { once: true });

  try {
    reactStream = renderToPipeableStream(prepared.element, {
      identifierPrefix: prepared.identifierPrefix,
      onShellReady: () => {
        if (!failed && !output.destroyed) reactStream?.pipe(destination);
      },
      onShellError: fail,
      onError: fail,
    });
  } catch (error) {
    fail(error);
  }

  return output;
}

interface PreparedReactRemote {
  element: ReturnType<typeof createElement>;
  identifierPrefix: string;
  openingTag: string;
  createClosingMarkup: () => string;
}

function prepareReactRemote<Props extends object>(
  options: RenderReactRemoteOptions<Props> & { suspense?: ReactRemoteSuspenseContract },
): PreparedReactRemote {
  if (typeof options.specifier !== 'string' || options.specifier.trim().length === 0) {
    throw new Error('specifier must be a non-empty string.');
  }
  if (options.props === null || typeof options.props !== 'object' || Array.isArray(options.props)) {
    throw new Error('props must be an object.');
  }

  const rootId = options.rootId ?? `mfe-react-${++nextGeneratedRootId}`;
  const marker = createReactRootMarker(rootId);
  const identifierPrefix = options.identifierPrefix ?? `${rootId}-`;
  const contract: ReactHydrationContract<Props> = {
    specifier: options.specifier,
    props: options.props,
    identifierPrefix,
    ...(options.suspense ? { suspense: options.suspense } : {}),
  };

  const createClosingMarkup = () => `</div>${createHydrationScript(rootId, contract)}`;
  createClosingMarkup();

  return {
    element: createElement(options.remote.default, options.props),
    identifierPrefix,
    openingTag: `<div id="${escapeHtmlAttribute(rootId)}" ${marker.attribute}="${escapeHtmlAttribute(marker.value)}">`,
    createClosingMarkup,
  };
}

function validateRemoteLoadOptions<Props extends object>(
  options: RenderReactRemoteBySpecifierStreamOptions<Props>,
  suspense: ReactRemoteSuspenseContract,
): void {
  if (typeof options.specifier !== 'string' || options.specifier.trim().length === 0) {
    throw new Error('specifier must be a non-empty string.');
  }
  if (options.props === null || typeof options.props !== 'object' || Array.isArray(options.props)) {
    throw new Error('props must be an object.');
  }
  if (!Number.isFinite(suspense.timeoutMs) || suspense.timeoutMs <= 0) {
    throw new Error('timeoutMs must be a positive finite number.');
  }
}

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

function escapeHtmlAttribute(value: string): string {
  const replacements: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  return value.replace(/[&<>"']/g, (character) => replacements[character]);
}
