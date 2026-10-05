import { register } from 'node:module';
import { MessageChannel } from 'node:worker_threads';

import type { RemoteManifest } from '@mfe-ssr/core';
import type { DiagnosticEvent } from '@mfe-ssr/core';

import type { NodeLoaderOptions } from './types';

export function registerNodeLoader(
  manifest: RemoteManifest,
  options: NodeLoaderOptions = {},
): void {
  const { onDiagnostic, ...serializableOptions } = options;
  const loaderUrl = new URL('./loader.mjs', import.meta.url);

  if (!onDiagnostic) {
    register(loaderUrl, {
      parentURL: import.meta.url,
      data: { manifest, options: serializableOptions },
    });
    return;
  }

  const channel = new MessageChannel();
  channel.port1.on('message', (event: unknown) => {
    if (!isDiagnosticEvent(event)) return;
    try {
      const result = onDiagnostic(event);
      void Promise.resolve(result).catch(() => {});
    } catch {
      // A diagnostics consumer must not affect loader behavior.
    }
  });
  channel.port1.unref();
  channel.port2.unref();

  register(new URL('./loader.mjs', import.meta.url), {
    parentURL: import.meta.url,
    data: {
      manifest,
      options: serializableOptions,
      diagnosticPort: channel.port2,
    },
    transferList: [channel.port2],
  });
}

function isDiagnosticEvent(value: unknown): value is DiagnosticEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  return (
    (event.phase === 'resolve' ||
      event.phase === 'fetch' ||
      event.phase === 'render' ||
      event.phase === 'hydrate' ||
      event.phase === 'health-check') &&
    (event.outcome === 'success' || event.outcome === 'failure' || event.outcome === 'unmatched') &&
    typeof event.timestamp === 'string' &&
    typeof event.durationMs === 'number'
  );
}
