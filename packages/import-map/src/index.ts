import {
  createManifestResolver,
  toImportMap,
  type ImportMap,
  type RemoteManifest,
} from '@mfe-ssr/core';

export interface CreateModulePreloadLinksOptions {
  /** Absolute URL of the HTML document, used to resolve relative manifest addresses. */
  documentUrl: string;
  /** Importing module URL used to apply import-map scopes, when relevant. */
  parentUrl?: string;
}

export function createBrowserImportMap(manifest: RemoteManifest): ImportMap {
  return toImportMap(manifest);
}

export function createModulePreloadLinks(
  manifest: RemoteManifest,
  selectedSpecifiers: readonly string[],
  options: CreateModulePreloadLinksOptions,
): string {
  const importMap = createBrowserImportMap(manifest);
  const resolver = createManifestResolver(manifest, { baseUrl: options.documentUrl });
  const integrityByUrl = new Map<string, string>();

  for (const [address, integrity] of Object.entries(importMap.integrity ?? {})) {
    const url = new URL(address, options.documentUrl).href;
    const previousIntegrity = integrityByUrl.get(url);
    if (previousIntegrity && previousIntegrity !== integrity) {
      throw new Error(`Conflicting remote integrity metadata maps to "${url}".`);
    }
    integrityByUrl.set(url, integrity);
  }

  const linksByUrl = new Map<string, string>();
  for (const specifier of selectedSpecifiers) {
    const url = resolver.resolve(specifier, options.parentUrl);
    if (!url) {
      throw new Error(`No remote manifest entry resolves selected remote "${specifier}".`);
    }
    if (linksByUrl.has(url)) continue;

    const integrity = integrityByUrl.get(url);
    linksByUrl.set(
      url,
      `<link rel="modulepreload" href="${escapeHtmlAttribute(url)}" crossorigin="anonymous"${integrity ? ` integrity="${escapeHtmlAttribute(integrity)}"` : ''}>`,
    );
  }

  return [...linksByUrl.values()].join('\n');
}

const HTML_ESCAPE_SEQUENCES: Record<string, string> = {
  '&': '\\u0026',
  '<': '\\u003C',
  '>': '\\u003E',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

function escapeHtmlAttribute(value: string): string {
  return value.replace(/[&"'<>]/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      default:
        return character;
    }
  });
}

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
