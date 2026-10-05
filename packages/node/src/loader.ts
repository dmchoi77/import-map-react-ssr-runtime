import { pathToFileURL } from 'node:url';

import { reportDiagnostic } from '@mfe-ssr/core';
import type { DiagnosticEvent, DiagnosticHandler } from '@mfe-ssr/core';
import type { RemoteManifest } from '@mfe-ssr/core';
import type { LoadHook, ResolveHook } from 'node:module';

import { createNodeResolver } from './index';
import { RemoteModuleError, RemoteModuleFetcher } from './remote-fetcher';
import type { NodeLoaderData } from './types';

let resolveRemote: ReturnType<typeof createNodeResolver> | undefined;
let fetcher: RemoteModuleFetcher | undefined;
let integrityByServerUrl: ReadonlyMap<string, string> = new Map();
let onDiagnostic: DiagnosticHandler | undefined;

export function initialize(data: NodeLoaderData): void {
  const options = data.options ?? {};
  const baseUrl = options.baseUrl ?? pathToFileURL(`${process.cwd()}/`).href;
  const diagnosticHandler =
    options.onDiagnostic ??
    (data.diagnosticPort
      ? (event: DiagnosticEvent) => {
          try {
            data.diagnosticPort?.postMessage(event);
          } catch {
            // A closed diagnostics channel must not break module loading.
          }
        }
      : undefined);
  data.diagnosticPort?.unref();
  onDiagnostic = diagnosticHandler;
  const nextResolver = createNodeResolver(data.manifest, {
    ...options,
    baseUrl,
    onDiagnostic: (event) => {
      if (event.outcome !== 'unmatched') {
        const { timestamp: _timestamp, ...input } = event;
        reportDiagnostic(diagnosticHandler, input);
      }
    },
  });
  const nextIntegrityByServerUrl = createServerIntegrityMap(data.manifest, baseUrl);
  const nextFetcher = new RemoteModuleFetcher({ ...options, onDiagnostic: diagnosticHandler });

  resolveRemote = nextResolver;
  integrityByServerUrl = nextIntegrityByServerUrl;
  fetcher = nextFetcher;
}

export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
  const startedAt = Date.now();
  const mappedUrl = resolveRemote?.(specifier, context.parentURL);
  if (mappedUrl) {
    return {
      url: mappedUrl,
      shortCircuit: true,
    };
  }

  if (context.parentURL && isRemoteUrl(context.parentURL) && isRelativeSpecifier(specifier)) {
    reportDiagnostic(onDiagnostic, {
      phase: 'resolve',
      outcome: 'success',
      durationMs: Date.now() - startedAt,
    });
    return {
      url: new URL(specifier, context.parentURL).href,
      shortCircuit: true,
    };
  }

  try {
    const result = await nextResolve(specifier, context);
    reportDiagnostic(onDiagnostic, {
      phase: 'resolve',
      outcome: 'unmatched',
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    reportDiagnostic(onDiagnostic, {
      phase: 'resolve',
      outcome: 'failure',
      durationMs: Date.now() - startedAt,
      errorCode: getErrorCode(error, 'RESOLUTION_FAILED'),
    });
    throw error;
  }
};

export const load: LoadHook = async (url, context, nextLoad) => {
  if (!isRemoteUrl(url)) {
    return nextLoad(url, context);
  }

  if (!fetcher) {
    throw new Error('The remote Node loader has not been initialized.');
  }

  return {
    format: 'module',
    source: await fetcher.fetch(url, integrityByServerUrl.get(url)),
    shortCircuit: true,
  };
};

function createServerIntegrityMap(
  manifest: RemoteManifest,
  baseUrl: string,
): ReadonlyMap<string, string> {
  const integrityByUrl = new Map<string, string>();
  const mappings = [
    ...Object.entries(manifest.imports),
    ...Object.values(manifest.scopes ?? {}).flatMap((scope) => Object.entries(scope)),
  ];

  for (const [specifier, entry] of mappings) {
    const integrity = entry.integrity?.server;
    if (!integrity || specifier.endsWith('/')) {
      continue;
    }

    const url = new URL(entry.server, baseUrl).href;
    const previousIntegrity = integrityByUrl.get(url);
    if (previousIntegrity && previousIntegrity !== integrity) {
      throw new RemoteModuleError(
        'INVALID_REMOTE_INTEGRITY',
        `Conflicting server integrity metadata maps to "${url}".`,
        url,
      );
    }
    integrityByUrl.set(url, integrity);
  }

  return integrityByUrl;
}

function isRemoteUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

function isRelativeSpecifier(value: string): boolean {
  return value.startsWith('./') || value.startsWith('../') || value.startsWith('/');
}

function getErrorCode(error: unknown, fallback: string): string {
  if (error instanceof RemoteModuleError) return error.code;
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return fallback;
}
