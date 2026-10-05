import { PassThrough, Writable } from 'node:stream';
import type { Readable } from 'node:stream';

import { createElement, lazy, Suspense } from 'react';
import type { ComponentType } from 'react';
import { renderToPipeableStream, renderToString } from 'react-dom/server';

import { reportDiagnostic } from '@mfe-ssr/core';
import type { DiagnosticHandler } from '@mfe-ssr/core';

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
  onDiagnostic?: DiagnosticHandler;
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
  onDiagnostic?: DiagnosticHandler;
  loadRemote?: (
    specifier: string,
    options: { signal?: AbortSignal },
  ) => Promise<ReactRemoteModule<Props>>;
}

let nextGeneratedRootId = 0;

export function renderReactRemote<Props extends object>(
  options: RenderReactRemoteOptions<Props>,
): string {
  const startedAt = Date.now();
  try {
    const prepared = prepareReactRemote(options);
    const html = renderToString(prepared.element, {
      identifierPrefix: prepared.identifierPrefix,
    });

    const markup = `${prepared.openingTag}${html}${prepared.createClosingMarkup()}`;
    reportDiagnostic(options.onDiagnostic, {
      phase: 'render',
      outcome: 'success',
      durationMs: Date.now() - startedAt,
      ...(options.remote.metadata?.id ? { remoteId: options.remote.metadata.id } : {}),
    });
    return markup;
  } catch (error) {
    reportDiagnostic(options.onDiagnostic, {
      phase: 'render',
      outcome: 'failure',
      durationMs: Date.now() - startedAt,
      errorCode: 'RENDER_FAILED',
      ...(options.remote.metadata?.id ? { remoteId: options.remote.metadata.id } : {}),
    });
    throw error;
  }
}

export function renderReactRemoteToStream<Props extends object>(
  options: RenderReactRemoteStreamOptions<Props>,
): Readable {
  const startedAt = Date.now();
  try {
    const prepared = prepareReactRemote(options);
    return renderPreparedReactRemoteToStream(
      prepared,
      options.signal,
      options.onDiagnostic,
      options.remote.metadata?.id,
      startedAt,
    );
  } catch (error) {
    reportDiagnostic(options.onDiagnostic, {
      phase: 'render',
      outcome: 'failure',
      durationMs: Date.now() - startedAt,
      errorCode: 'RENDER_FAILED',
      ...(options.remote.metadata?.id ? { remoteId: options.remote.metadata.id } : {}),
    });
    throw error;
  }
}

export function renderReactRemoteBySpecifierToStream<Props extends object>(
  options: RenderReactRemoteBySpecifierStreamOptions<Props>,
): Readable {
  const startedAt = Date.now();
  const suspense: ReactRemoteSuspenseContract = {
    fallback: options.fallback ?? 'Loading remote',
    errorFallback: options.errorFallback ?? 'Remote unavailable',
    timeoutMs: options.timeoutMs ?? 10_000,
    serverFallback: false,
  };
  try {
    validateRemoteLoadOptions(options, suspense);

    const Remote = lazy(async () => {
      const loadStartedAt = Date.now();
      try {
        const remote = await loadWithTimeout(
          (signal) =>
            options.loadRemote
              ? options.loadRemote(options.specifier, { signal })
              : (import(/* @vite-ignore */ options.specifier) as Promise<ReactRemoteModule<Props>>),
          suspense.timeoutMs,
          options.signal,
        );
        reportDiagnostic(options.onDiagnostic, {
          phase: 'resolve',
          outcome: 'success',
          durationMs: Date.now() - loadStartedAt,
          ...(remote.metadata?.id ? { remoteId: remote.metadata.id } : {}),
        });
        return { default: remote.default };
      } catch (error) {
        reportDiagnostic(options.onDiagnostic, {
          phase: 'resolve',
          outcome: 'failure',
          durationMs: Date.now() - loadStartedAt,
          errorCode: getDiagnosticErrorCode(error, 'REMOTE_LOAD_FAILED'),
        });
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

    return renderPreparedReactRemoteToStream(
      prepared,
      options.signal,
      options.onDiagnostic,
      undefined,
      startedAt,
    );
  } catch (error) {
    reportDiagnostic(options.onDiagnostic, {
      phase: 'render',
      outcome: 'failure',
      durationMs: Date.now() - startedAt,
      errorCode: 'RENDER_FAILED',
    });
    throw error;
  }
}

function renderPreparedReactRemoteToStream(
  prepared: PreparedReactRemote,
  signal: AbortSignal | undefined,
  onDiagnostic: DiagnosticHandler | undefined,
  remoteId: string | undefined,
  startedAt: number,
): Readable {
  const output = new PassThrough();
  let reactStream: ReturnType<typeof renderToPipeableStream> | undefined;
  let rootWritten = false;
  let finishedNormally = false;
  let failed = false;
  let reported = false;

  const report = (outcome: 'success' | 'failure', errorCode?: string) => {
    if (reported) return;
    reported = true;
    reportDiagnostic(onDiagnostic, {
      phase: 'render',
      outcome,
      durationMs: Date.now() - startedAt,
      ...(remoteId ? { remoteId } : {}),
      ...(errorCode ? { errorCode } : {}),
    });
  };

  const cleanup = () => signal?.removeEventListener('abort', abort);
  const fail = (reason: unknown) => {
    if (failed || output.destroyed) return;
    failed = true;
    report('failure', getDiagnosticErrorCode(reason, 'RENDER_FAILED'));
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
        output.end(prepared.createClosingMarkup(), () => report('success'));
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
    if (!finishedNormally && !failed) {
      report('failure', 'RENDER_ABORTED');
      reactStream?.abort();
    }
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

function getDiagnosticErrorCode(error: unknown, fallback: string): string {
  if (error instanceof Error && error.name === 'AbortError') return 'ABORTED';
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return fallback;
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
