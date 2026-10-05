import { Component, createElement, lazy, Suspense } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';

import { loadWithTimeout } from './load';
import { deserializeHydrationData } from './serialize';
import { REACT_HYDRATION_DATA_ATTRIBUTE, REACT_ROOT_MARKER_ATTRIBUTE } from './types';
import type {
  ReactHydrationContract,
  ReactRemoteModule,
  ReactRemoteSuspenseContract,
} from './types';

const hydrationByRoot = new WeakMap<HTMLElement, Promise<void>>();

export function hydrateReactRemotes(targetDocument?: Document): Promise<void> {
  const documentToHydrate =
    targetDocument ?? (typeof document === 'undefined' ? undefined : document);
  if (!documentToHydrate) {
    return Promise.resolve();
  }

  const roots = documentToHydrate.querySelectorAll<HTMLElement>(`[${REACT_ROOT_MARKER_ATTRIBUTE}]`);
  return Promise.all(
    Array.from(roots, (root) => hydrateRootFromContract(root, documentToHydrate)),
  ).then(() => undefined);
}

function hydrateRootFromContract(root: HTMLElement, documentToHydrate: Document): Promise<void> {
  const existingHydration = hydrationByRoot.get(root);
  if (existingHydration) {
    return existingHydration;
  }

  const hydration = hydrateRootOnce(root, documentToHydrate);
  hydrationByRoot.set(root, hydration);
  return hydration;
}

async function hydrateRootOnce(root: HTMLElement, documentToHydrate: Document): Promise<void> {
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
          const remote = await loadWithTimeout(
            () =>
              import(/* @vite-ignore */ contract.specifier) as Promise<
                ReactRemoteModule<Record<string, unknown>>
              >,
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
                specifier: contract.specifier,
                fallback: contract.suspense.errorFallback,
              },
              createElement(remote.default, contract.props),
            ),
          );
        } catch (error) {
          renderClientFallback(root, documentToHydrate, error, contract.suspense.errorFallback);
        }
        return;
      }

      const remotePromise = loadWithTimeout(
        (_signal) =>
          import(/* @vite-ignore */ contract.specifier) as Promise<
            ReactRemoteModule<Record<string, unknown>>
          >,
        contract.suspense.timeoutMs,
      );
      void remotePromise.catch(() => {});
      const Remote = lazy(() => remotePromise.then((remote) => ({ default: remote.default })));
      hydrateRoot(
        root,
        createElement(
          Suspense,
          { fallback: createElement('p', null, contract.suspense.fallback) },
          createElement(
            RemoteLoadErrorBoundary,
            { root, specifier: contract.specifier, fallback: contract.suspense.errorFallback },
            createElement(Remote, contract.props),
          ),
        ),
        {
          identifierPrefix: contract.identifierPrefix,
          onRecoverableError(error) {
            console.error(
              `React remote "${contract.specifier}" recovered during hydration.`,
              error,
            );
          },
        },
      );
      await remotePromise.catch(() => undefined);
      return;
    }

    const remote = (await import(/* @vite-ignore */ contract.specifier)) as ReactRemoteModule<
      Record<string, unknown>
    >;
    hydrateRoot(root, createElement(remote.default, contract.props), {
      identifierPrefix: contract.identifierPrefix,
      onRecoverableError(error) {
        console.error(`React remote "${contract.specifier}" recovered during hydration.`, error);
      },
    });
  } catch (error) {
    renderClientFallback(root, documentToHydrate, error);
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
  specifier: string;
  fallback: string;
  children?: ReactNode;
}

class RemoteLoadErrorBoundary extends Component<RemoteLoadErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.props.root.dataset.mfeFallback = 'client';
    console.error(`React remote "${this.props.specifier}" could not be hydrated.`, error);
  }

  render(): ReactNode {
    return this.state.failed ? createElement('p', null, this.props.fallback) : this.props.children;
  }
}

function renderClientFallback(
  root: HTMLElement,
  documentToHydrate: Document,
  error: unknown,
  fallbackText = 'Remote unavailable',
): void {
  const message = documentToHydrate.createElement('p');
  message.textContent = fallbackText;
  root.replaceChildren(message);
  root.dataset.mfeFallback = 'client';
  console.error('Remote hydration failed.', error);
}
