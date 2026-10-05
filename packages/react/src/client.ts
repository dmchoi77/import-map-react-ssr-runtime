import { createElement } from 'react';
import { hydrateRoot } from 'react-dom/client';

import { deserializeHydrationData } from './serialize';
import { REACT_HYDRATION_DATA_ATTRIBUTE, REACT_ROOT_MARKER_ATTRIBUTE } from './types';
import type { ReactHydrationContract, ReactRemoteModule } from './types';

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
    typeof contract.identifierPrefix === 'string'
  );
}

function renderClientFallback(
  root: HTMLElement,
  documentToHydrate: Document,
  error: unknown,
): void {
  const message = documentToHydrate.createElement('p');
  message.textContent = 'Remote unavailable';
  root.replaceChildren(message);
  root.dataset.mfeFallback = 'client';
  console.error('Remote hydration failed.', error);
}
