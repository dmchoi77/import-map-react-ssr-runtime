import { PassThrough, Writable } from 'node:stream';
import type { Readable } from 'node:stream';

import { createElement } from 'react';
import { renderToPipeableStream, renderToString } from 'react-dom/server';

import { createHydrationScript } from './serialize';
import { createReactRootMarker } from './types';
import type { ReactHydrationContract, ReactRemoteModule } from './types';

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

let nextGeneratedRootId = 0;

export function renderReactRemote<Props extends object>(
  options: RenderReactRemoteOptions<Props>,
): string {
  const prepared = prepareReactRemote(options);
  const html = renderToString(prepared.element, {
    identifierPrefix: prepared.identifierPrefix,
  });

  return `${prepared.openingTag}${html}${prepared.closingMarkup}`;
}

export function renderReactRemoteToStream<Props extends object>(
  options: RenderReactRemoteStreamOptions<Props>,
): Readable {
  const prepared = prepareReactRemote(options);
  const output = new PassThrough();
  const signal = options.signal;
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
        output.end(prepared.closingMarkup);
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
  closingMarkup: string;
}

function prepareReactRemote<Props extends object>(
  options: RenderReactRemoteOptions<Props>,
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
  };

  return {
    element: createElement(options.remote.default, options.props),
    identifierPrefix,
    openingTag: `<div id="${escapeHtmlAttribute(rootId)}" ${marker.attribute}="${escapeHtmlAttribute(marker.value)}">`,
    closingMarkup: `</div>${createHydrationScript(rootId, contract)}`,
  };
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
