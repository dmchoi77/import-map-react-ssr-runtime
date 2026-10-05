import { Component, createElement, lazy, Suspense } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';

import type { DiagnosticEventInput, DiagnosticHandler } from '@mfe-ssr/core';

import { loadWithTimeout } from './load';
import { deserializeHydrationData } from './serialize';
import { REACT_HYDRATION_DATA_ATTRIBUTE, REACT_ROOT_MARKER_ATTRIBUTE } from './types';
import type {
  ReactHydrationContract,
  ReactRemoteModule,
  ReactRemoteSuspenseContract,
} from './types';

const hydrationByRoot = new WeakMap<HTMLElement, Promise<void>>();
let configuredDiagnosticHandler: DiagnosticHandler | undefined;

export interface HydrateReactRemotesOptions {
  onDiagnostic?: DiagnosticHandler;
}

/** Sets the optional handler used by the automatic bootstrap entry point. */
export function setReactDiagnosticHandler(handler?: DiagnosticHandler): void {
  configuredDiagnosticHandler = handler;
}

export function hydrateReactRemotes(
  targetDocument?: Document,
  options: HydrateReactRemotesOptions = {},
): Promise<void> {
  const documentToHydrate =
    targetDocument ?? (typeof document === 'undefined' ? undefined : document);
  if (!documentToHydrate) {
    return Promise.resolve();
  }

  const onDiagnostic = options.onDiagnostic ?? configuredDiagnosticHandler;
  const roots = documentToHydrate.querySelectorAll<HTMLElement>(`[${REACT_ROOT_MARKER_ATTRIBUTE}]`);
  return Promise.all(
    Array.from(roots, (root) => hydrateRootFromContract(root, documentToHydrate, onDiagnostic)),
  ).then(() => undefined);
}

function hydrateRootFromContract(
  root: HTMLElement,
  documentToHydrate: Document,
  onDiagnostic: DiagnosticHandler | undefined,
): Promise<void> {
  const existingHydration = hydrationByRoot.get(root);
  if (existingHydration) {
    return existingHydration;
  }

  const hydration = hydrateRootOnce(root, documentToHydrate, onDiagnostic);
  hydrationByRoot.set(root, hydration);
  return hydration;
}

async function hydrateRootOnce(
  root: HTMLElement,
  documentToHydrate: Document,
  onDiagnostic: DiagnosticHandler | undefined,
): Promise<void> {
  const startedAt = Date.now();
  const rootId = root.getAttribute(REACT_ROOT_MARKER_ATTRIBUTE);

  try {
    if (!rootId) {
      throw new Error('Missing React root id.');
    }

    const hydrationScript = Array.from(
      documentToHydrate.querySelectorAll<HTMLScriptElement>(
        `script[type="application/json"][${REACT_HYDRATION_DATA_ATTRIBUTE}]`,
      ),
    ).find((script) => script.getAttribute(REACT_HYDRATION_DATA_ATTRIBUTE) === rootId);

    if (!hydrationScript?.textContent) {
      throw new Error(`Missing hydration contract for React root "${rootId}".`);
    }

    const contract = deserializeHydrationData(hydrationScript.textContent);
    if (!isHydrationContract(contract)) {
      throw new Error(`Invalid hydration contract for React root "${rootId}".`);
    }

    if (contract.suspense) {
      if (contract.suspense.serverFallback) {
        try {
          const remote = await loadClientRemote(
            contract.specifier,
            onDiagnostic,
            contract.suspense.timeoutMs,
          );
          const clientRoot = createRoot(root, {
            identifierPrefix: contract.identifierPrefix,
          });
          clientRoot.render(
            createElement(
              RemoteLoadErrorBoundary,
              {
                root,
                fallback: contract.suspense.errorFallback,
                onDiagnostic,
                startedAt,
              },
              createElement(remote.default, contract.props),
            ),
          );
          reportHydration(onDiagnostic, 'success', startedAt, remote.metadata?.id);
        } catch {
          renderClientFallback(
            root,
            documentToHydrate,
            contract.suspense.errorFallback,
            onDiagnostic,
            startedAt,
            'REMOTE_IMPORT_FAILED',
          );
        }
        return;
      }

      const remoteLoadState = { failed: false };
      const remotePromise = loadClientRemote(
        contract.specifier,
        onDiagnostic,
        contract.suspense.timeoutMs,
      ).catch((error: unknown) => {
        remoteLoadState.failed = true;
        reportHydration(onDiagnostic, 'failure', startedAt, undefined, 'REMOTE_IMPORT_FAILED');
        throw error;
      });
      void remotePromise.catch(() => {});
      const Remote = lazy(() => remotePromise.then((remote) => ({ default: remote.default })));
      hydrateRoot(
        root,
        createElement(
          Suspense,
          { fallback: createElement('p', null, contract.suspense.fallback) },
          createElement(
            RemoteLoadErrorBoundary,
            {
              root,
              fallback: contract.suspense.errorFallback,
              onDiagnostic,
              startedAt,
              isRemoteLoadFailure: () => remoteLoadState.failed,
            },
            createElement(Remote, contract.props),
          ),
        ),
        {
          identifierPrefix: contract.identifierPrefix,
          onRecoverableError(_error) {
            if (!remoteLoadState.failed) {
              reportHydration(
                onDiagnostic,
                'failure',
                startedAt,
                undefined,
                'HYDRATION_RECOVERABLE_ERROR',
              );
            }
          },
        },
      );
      try {
        const remote = await remotePromise;
        reportHydration(onDiagnostic, 'success', startedAt, remote.metadata?.id);
      } catch {}
      return;
    }

    const remote = await loadClientRemote(contract.specifier, onDiagnostic);
    hydrateRoot(root, createElement(remote.default, contract.props), {
      identifierPrefix: contract.identifierPrefix,
      onRecoverableError(_error) {
        reportHydration(
          onDiagnostic,
          'failure',
          startedAt,
          remote.metadata?.id,
          'HYDRATION_RECOVERABLE_ERROR',
        );
      },
    });
    reportHydration(onDiagnostic, 'success', startedAt, remote.metadata?.id);
  } catch {
    renderClientFallback(
      root,
      documentToHydrate,
      'Remote unavailable',
      onDiagnostic,
      startedAt,
      'HYDRATION_FAILED',
    );
  }
}

function isHydrationContract(
  value: unknown,
): value is ReactHydrationContract<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const contract = value as Record<string, unknown>;
  return (
    typeof contract.specifier === 'string' &&
    contract.specifier.trim().length > 0 &&
    typeof contract.props === 'object' &&
    contract.props !== null &&
    !Array.isArray(contract.props) &&
    typeof contract.identifierPrefix === 'string' &&
    (contract.suspense === undefined || isRemoteSuspenseContract(contract.suspense))
  );
}

function isRemoteSuspenseContract(value: unknown): value is ReactRemoteSuspenseContract {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const suspense = value as Record<string, unknown>;
  return (
    typeof suspense.fallback === 'string' &&
    typeof suspense.errorFallback === 'string' &&
    typeof suspense.timeoutMs === 'number' &&
    Number.isFinite(suspense.timeoutMs) &&
    suspense.timeoutMs > 0 &&
    typeof suspense.serverFallback === 'boolean'
  );
}

interface RemoteLoadErrorBoundaryProps {
  root: HTMLElement;
  fallback: string;
  onDiagnostic?: DiagnosticHandler;
  startedAt: number;
  isRemoteLoadFailure?: () => boolean;
  children?: ReactNode;
}

class RemoteLoadErrorBoundary extends Component<RemoteLoadErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    this.props.root.dataset.mfeFallback = 'client';
    if (!this.props.isRemoteLoadFailure?.()) {
      reportHydration(
        this.props.onDiagnostic,
        'failure',
        this.props.startedAt,
        undefined,
        'HYDRATION_RENDER_FAILED',
      );
    }
  }

  render(): ReactNode {
    return this.state.failed ? createElement('p', null, this.props.fallback) : this.props.children;
  }
}

function renderClientFallback(
  root: HTMLElement,
  documentToHydrate: Document,
  fallbackText = 'Remote unavailable',
  onDiagnostic?: DiagnosticHandler,
  startedAt = Date.now(),
  errorCode = 'HYDRATION_FAILED',
): void {
  const message = documentToHydrate.createElement('p');
  message.textContent = fallbackText;
  root.replaceChildren(message);
  root.dataset.mfeFallback = 'client';
  reportHydration(onDiagnostic, 'failure', startedAt, undefined, errorCode);
}

function reportHydration(
  handler: DiagnosticHandler | undefined,
  outcome: 'success' | 'failure',
  startedAt: number,
  remoteId?: string,
  errorCode?: string,
): void {
  reportClientDiagnostic(handler, {
    phase: 'hydrate',
    outcome,
    durationMs: Date.now() - startedAt,
    ...(remoteId ? { remoteId } : {}),
    ...(errorCode ? { errorCode } : {}),
  });
}

async function loadClientRemote(
  specifier: string,
  onDiagnostic: DiagnosticHandler | undefined,
  timeoutMs?: number,
): Promise<ReactRemoteModule<Record<string, unknown>>> {
  const startedAt = Date.now();
  try {
    const load = () =>
      import(/* @vite-ignore */ specifier) as Promise<ReactRemoteModule<Record<string, unknown>>>;
    const remote =
      timeoutMs === undefined ? await load() : await loadWithTimeout(() => load(), timeoutMs);
    reportClientDiagnostic(onDiagnostic, {
      phase: 'resolve',
      outcome: 'success',
      durationMs: Date.now() - startedAt,
      ...(remote.metadata?.id ? { remoteId: remote.metadata.id } : {}),
    });
    return remote;
  } catch (error) {
    reportClientDiagnostic(onDiagnostic, {
      phase: 'resolve',
      outcome: 'failure',
      durationMs: Date.now() - startedAt,
      errorCode: 'REMOTE_IMPORT_FAILED',
    });
    throw error;
  }
}

function reportClientDiagnostic(
  handler: DiagnosticHandler | undefined,
  event: DiagnosticEventInput,
): void {
  if (!handler) return;
  try {
    const result = handler(
      Object.freeze({
        ...event,
        timestamp: new Date().toISOString(),
        durationMs: Math.max(0, event.durationMs),
      }),
    );
    void Promise.resolve(result).catch(() => {});
  } catch {
    // Diagnostics must not affect browser hydration.
  }
}
