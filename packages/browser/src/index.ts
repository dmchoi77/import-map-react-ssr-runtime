import { toImportMap, type ImportMap, type RemoteManifest } from '@mfe-ssr/core';

export type BrowserImportErrorCode = 'INVALID_SPECIFIER' | 'REMOTE_IMPORT_FAILED';

export class BrowserImportError extends Error {
  readonly code: BrowserImportErrorCode;
  readonly specifier: string;

  constructor(
    code: BrowserImportErrorCode,
    message: string,
    specifier: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BrowserImportError';
    this.code = code;
    this.specifier = specifier;
  }
}

export function createBrowserImportMap(manifest: RemoteManifest): ImportMap {
  return toImportMap(manifest, 'client');
}

const HTML_ESCAPE_SEQUENCES: Record<string, string> = {
  '&': '\\u0026',
  '<': '\\u003C',
  '>': '\\u003E',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

export function serializeImportMap(importMap: ImportMap): string {
  return JSON.stringify(importMap).replace(/[&<>\u2028\u2029]/g, (character) => {
    return HTML_ESCAPE_SEQUENCES[character];
  });
}

export function createImportMapScript(manifest: RemoteManifest): string {
  return `<script type="importmap">${serializeImportMap(createBrowserImportMap(manifest))}</script>`;
}

export function injectImportMap(document: Document, manifest: RemoteManifest): HTMLScriptElement {
  if (document.querySelector('script[type="importmap"]')) {
    throw new Error('An import map script is already present in the document.');
  }

  const script = document.createElement('script');
  script.type = 'importmap';
  script.textContent = serializeImportMap(createBrowserImportMap(manifest));

  const moduleScript = document.querySelector('script[type="module"]');
  const container = moduleScript?.parentElement ?? document.head ?? document.documentElement;

  if (!container) {
    throw new Error('The document has no element where the import map can be inserted.');
  }

  const reference = moduleScript?.parentElement === container ? moduleScript : container.firstChild;
  container.insertBefore(script, reference);
  return script;
}

export async function loadRemote<T = unknown>(specifier: string): Promise<T> {
  if (typeof specifier !== 'string' || specifier.trim().length === 0) {
    throw new BrowserImportError(
      'INVALID_SPECIFIER',
      'Remote module specifier must be a non-empty string.',
      specifier,
    );
  }

  try {
    return (await import(specifier)) as T;
  } catch (cause) {
    throw new BrowserImportError(
      'REMOTE_IMPORT_FAILED',
      `Failed to import remote module "${specifier}".`,
      specifier,
      { cause },
    );
  }
}
