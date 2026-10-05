import { stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createManifestResolver, reportDiagnostic } from '@mfe-ssr/core';
import type { DiagnosticHandler, RemoteManifest, ResolverTarget } from '@mfe-ssr/core';

export type RemoteHealthStatus = 'healthy' | 'unhealthy';

export type RemoteHealthErrorCode =
  | 'INVALID_REMOTE_URL'
  | 'REMOTE_ORIGIN_NOT_ALLOWED'
  | 'REMOTE_HEALTH_TIMEOUT'
  | 'REMOTE_HEALTH_FAILED'
  | 'REMOTE_HTTP_ERROR'
  | 'REMOTE_FILE_UNAVAILABLE';

export interface RemoteHealthResult {
  remoteId: string;
  /** Credentials, query parameters, and fragments are removed. */
  endpoint: string;
  status: RemoteHealthStatus;
  checkedAt: string;
  durationMs: number;
  statusCode?: number;
  errorCode?: RemoteHealthErrorCode;
}

export interface RemoteHealthCheckOptions {
  target?: ResolverTarget;
  baseUrl?: string;
  allowedOrigins?: readonly string[];
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
  onDiagnostic?: DiagnosticHandler;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_SERVER_BASE_URL = pathToFileURL(`${process.cwd()}/`).href;
const DEFAULT_CLIENT_BASE_URL = 'https://mfe-health.invalid/';

/** Checks unique manifest remotes without evaluating or downloading module source. */
export async function checkRemoteHealth(
  manifest: RemoteManifest,
  options: RemoteHealthCheckOptions = {},
): Promise<RemoteHealthResult[]> {
  const target = options.target ?? 'server';
  const baseUrl =
    options.baseUrl ?? (target === 'server' ? DEFAULT_SERVER_BASE_URL : DEFAULT_CLIENT_BASE_URL);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('timeoutMs must be a positive finite number.');
  }

  // Reuse core validation for manifest shape and target-specific base URL constraints.
  createManifestResolver(manifest, target, { baseUrl });

  const allowedOrigins = new Set(
    (options.allowedOrigins ?? []).map((origin) => new URL(origin).origin),
  );
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const entriesById = new Map<string, (typeof manifest.imports)[string]>();
  for (const entry of [
    ...Object.values(manifest.imports),
    ...Object.values(manifest.scopes ?? {}).flatMap((scope) => Object.values(scope)),
  ]) {
    if (!entriesById.has(entry.id)) entriesById.set(entry.id, entry);
  }

  return Promise.all(
    [...entriesById.values()].map(async (entry) => {
      const startedAt = Date.now();
      let endpoint: string;
      try {
        endpoint = new URL(entry[target], baseUrl).href;
      } catch {
        return createResult(entry.id, 'unavailable', false, startedAt, {
          errorCode: 'INVALID_REMOTE_URL',
          onDiagnostic: options.onDiagnostic,
        });
      }

      const parsedEndpoint = new URL(endpoint);
      const safeEndpoint = sanitizeEndpoint(parsedEndpoint);
      let statusCode: number | undefined;
      let errorCode: RemoteHealthErrorCode | undefined;
      let healthy = false;

      if (parsedEndpoint.protocol === 'file:') {
        try {
          await stat(fileURLToPath(parsedEndpoint));
          healthy = true;
        } catch {
          errorCode = 'REMOTE_FILE_UNAVAILABLE';
        }
      } else if (parsedEndpoint.protocol === 'http:' || parsedEndpoint.protocol === 'https:') {
        if (!allowedOrigins.has(parsedEndpoint.origin)) {
          errorCode = 'REMOTE_ORIGIN_NOT_ALLOWED';
        } else {
          const controller = new AbortController();
          let timedOut = false;
          let timeoutId: ReturnType<typeof setTimeout> | undefined;
          const timeout = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              timedOut = true;
              controller.abort();
              reject(new Error('Remote health check timed out.'));
            }, timeoutMs);
          });

          try {
            const response = await Promise.race([
              fetchImpl(parsedEndpoint.href, {
                method: 'HEAD',
                redirect: 'manual',
                signal: controller.signal,
              }),
              timeout,
            ]);
            statusCode = response.status;
            healthy = response.ok;
            if (!healthy) errorCode = 'REMOTE_HTTP_ERROR';
            void response.body?.cancel().catch(() => {});
          } catch {
            errorCode = timedOut ? 'REMOTE_HEALTH_TIMEOUT' : 'REMOTE_HEALTH_FAILED';
          } finally {
            if (timeoutId !== undefined) clearTimeout(timeoutId);
          }
        }
      } else {
        errorCode = 'INVALID_REMOTE_URL';
      }

      return createResult(entry.id, safeEndpoint, healthy, startedAt, {
        ...(statusCode === undefined ? {} : { statusCode }),
        ...(errorCode === undefined ? {} : { errorCode }),
        onDiagnostic: options.onDiagnostic,
      });
    }),
  );
}

function createResult(
  remoteId: string,
  endpoint: string,
  healthy: boolean,
  startedAt: number,
  options: {
    statusCode?: number;
    errorCode?: RemoteHealthErrorCode;
    onDiagnostic?: DiagnosticHandler;
  } = {},
): RemoteHealthResult {
  const durationMs = Date.now() - startedAt;
  const result: RemoteHealthResult = {
    remoteId,
    endpoint,
    status: healthy ? 'healthy' : 'unhealthy',
    checkedAt: new Date().toISOString(),
    durationMs,
    ...(options.statusCode === undefined ? {} : { statusCode: options.statusCode }),
    ...(options.errorCode === undefined ? {} : { errorCode: options.errorCode }),
  };

  reportDiagnostic(options.onDiagnostic, {
    phase: 'health-check',
    outcome: healthy ? 'success' : 'failure',
    remoteId,
    durationMs,
    ...(options.statusCode === undefined ? {} : { statusCode: options.statusCode }),
    ...(options.errorCode === undefined ? {} : { errorCode: options.errorCode }),
  });
  return result;
}

function sanitizeEndpoint(endpoint: URL): string {
  const safeEndpoint = new URL(endpoint);
  safeEndpoint.username = '';
  safeEndpoint.password = '';
  safeEndpoint.search = '';
  safeEndpoint.hash = '';
  return safeEndpoint.href;
}
