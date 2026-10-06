import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createBrowserImportMap,
  createImportMapScript,
  createModulePreloadLinks,
  injectImportMap,
  serializeImportMap,
} from './index';
import type { RemoteManifest } from '@mfe-ssr/core';

const cartIntegrity = `sha384-${createHash('sha384').update('cart').digest('base64')}`;

const manifest: RemoteManifest = {
  imports: {
    '@mfe/cart': {
      id: '@mfe/cart',
      version: '1.0.0',
      url: 'https://cdn.example.com/cart/remote.mjs',
      integrity: cartIntegrity,
    },
  },
  scopes: {
    '/checkout/': {
      '@mfe/cart': {
        id: '@mfe/cart-checkout',
        version: '1.1.0',
        url: 'https://cdn.example.com/cart-checkout/remote.mjs',
      },
    },
  },
};

class FakeElement {
  readonly children: FakeElement[] = [];
  parentNode: FakeElement | null = null;
  textContent = '';
  type = '';

  constructor(readonly tagName: string) {}

  get firstChild(): FakeElement | null {
    return this.children[0] ?? null;
  }

  appendChild(child: FakeElement): FakeElement {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  insertBefore(child: FakeElement, reference: FakeElement | null): FakeElement {
    child.parentNode = this;
    const index = reference === null ? -1 : this.children.indexOf(reference);
    if (index === -1) {
      this.children.push(child);
    } else {
      this.children.splice(index, 0, child);
    }
    return child;
  }

  find(predicate: (element: FakeElement) => boolean): FakeElement | null {
    if (predicate(this)) {
      return this;
    }

    for (const child of this.children) {
      const match = child.find(predicate);
      if (match) {
        return match;
      }
    }

    return null;
  }
}

class FakeDocument {
  readonly documentElement = new FakeElement('html');
  readonly head = new FakeElement('head');
  readonly body = new FakeElement('body');

  constructor() {
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }

  querySelector(selector: string): FakeElement | null {
    return this.documentElement.find((element) => {
      return (
        (selector === 'script[type="importmap"]' &&
          element.tagName === 'script' &&
          element.type === 'importmap') ||
        (selector === 'script[type="module"]' &&
          element.tagName === 'script' &&
          element.type === 'module')
      );
    });
  }
}

describe('import map generation', () => {
  it('creates a browser import map from the remote manifest', () => {
    expect(createBrowserImportMap(manifest)).toEqual({
      imports: {
        '@mfe/cart': 'https://cdn.example.com/cart/remote.mjs',
      },
      integrity: {
        'https://cdn.example.com/cart/remote.mjs': cartIntegrity,
      },
      scopes: {
        '/checkout/': {
          '@mfe/cart': 'https://cdn.example.com/cart-checkout/remote.mjs',
        },
      },
    });
  });
});

describe('serializeImportMap', () => {
  it('escapes HTML-sensitive characters without changing the parsed import map', () => {
    const importMap = {
      imports: {
        '@mfe/danger': 'https://cdn.example.com/</script><script>alert(1)</script>&.js',
      },
    };

    const serialized = serializeImportMap(importMap);

    expect(serialized).not.toContain('</script>');
    expect(serialized).toContain('\\u003C');
    expect(JSON.parse(serialized)).toEqual(importMap);
  });
});

describe('createImportMapScript', () => {
  it('creates an inline import map script for SSR HTML', () => {
    const script = createImportMapScript(manifest);
    const json = script.slice('<script type="importmap">'.length, -'</script>'.length);

    expect(script).toMatch(/^<script type="importmap">[\s\S]*<\/script>$/);
    expect(JSON.parse(json)).toEqual(createBrowserImportMap(manifest));
  });
});

describe('createModulePreloadLinks', () => {
  it('preloads only selected remotes and carries their integrity metadata', () => {
    const links = createModulePreloadLinks(manifest, ['@mfe/cart'], {
      documentUrl: 'https://app.example.com/products/42',
    });

    expect(links).toContain(
      `<link rel="modulepreload" href="https://cdn.example.com/cart/remote.mjs" crossorigin="anonymous" integrity="${cartIntegrity}">`,
    );
    expect(links.match(/rel="modulepreload"/g)).toHaveLength(1);
    expect(links).not.toContain('cart-checkout');
  });

  it('uses the scoped mapping selected by the importing module URL', () => {
    const links = createModulePreloadLinks(manifest, ['@mfe/cart'], {
      documentUrl: 'https://app.example.com/checkout',
      parentUrl: 'https://app.example.com/checkout/entry.mjs',
    });

    expect(links).toContain('https://cdn.example.com/cart-checkout/remote.mjs');
    expect(links).not.toContain('https://cdn.example.com/cart/remote.mjs');
  });

  it('deduplicates selected aliases that resolve to one URL', () => {
    const manifestWithAlias: RemoteManifest = {
      imports: {
        ...manifest.imports,
        '@mfe/cart-alias': {
          ...manifest.imports['@mfe/cart'],
          id: '@mfe/cart-alias',
        },
      },
    };

    const links = createModulePreloadLinks(manifestWithAlias, ['@mfe/cart', '@mfe/cart-alias'], {
      documentUrl: 'https://app.example.com/',
    });

    expect(links.match(/rel="modulepreload"/g)).toHaveLength(1);
  });

  it('resolves relative remote entries against the document URL', () => {
    const relativeManifest: RemoteManifest = {
      imports: {
        '@mfe/relative': {
          id: '@mfe/relative',
          version: '1.0.0',
          url: './assets/remote.mjs',
          integrity: cartIntegrity,
        },
      },
    };

    const links = createModulePreloadLinks(relativeManifest, ['@mfe/relative'], {
      documentUrl: 'https://app.example.com/catalog/item',
    });

    expect(links).toContain('href="https://app.example.com/catalog/assets/remote.mjs"');
    expect(links).toContain(`integrity="${cartIntegrity}"`);
  });

  it('throws when a selected specifier is not mapped by the manifest', () => {
    expect(() =>
      createModulePreloadLinks(manifest, ['@mfe/missing'], {
        documentUrl: 'https://app.example.com/',
      }),
    ).toThrow('No remote manifest entry resolves selected remote "@mfe/missing".');
  });
});

describe('injectImportMap', () => {
  it('inserts the import map before the first module script', () => {
    const document = new FakeDocument();
    const moduleScript = document.createElement('script');
    moduleScript.type = 'module';
    document.head.appendChild(moduleScript);

    const importMapScript = injectImportMap(document as unknown as Document, manifest);

    expect(document.head.children).toEqual([importMapScript, moduleScript]);
    expect(importMapScript.type).toBe('importmap');
    expect(importMapScript.textContent).toBe(serializeImportMap(createBrowserImportMap(manifest)));
  });
});
