import { describe, expect, it } from 'vitest';

import {
  createBrowserImportMap,
  createImportMapScript,
  injectImportMap,
  BrowserImportError,
  loadRemote,
  serializeImportMap,
} from './index';
import type { RemoteManifest } from '@mfe-ssr/core';

const manifest: RemoteManifest = {
  imports: {
    '@mfe/cart': {
      id: '@mfe/cart',
      version: '1.0.0',
      client: 'https://cdn.example.com/cart/client.js',
      server: 'file:///srv/cart/server.js',
    },
  },
  scopes: {
    '/checkout/': {
      '@mfe/cart': {
        id: '@mfe/cart-checkout',
        version: '1.1.0',
        client: 'https://cdn.example.com/cart-checkout/client.js',
        server: 'file:///srv/cart-checkout/server.js',
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

describe('createBrowserImportMap', () => {
  it('creates a client import map from the remote manifest', () => {
    expect(createBrowserImportMap(manifest)).toEqual({
      imports: {
        '@mfe/cart': 'https://cdn.example.com/cart/client.js',
      },
      scopes: {
        '/checkout/': {
          '@mfe/cart': 'https://cdn.example.com/cart-checkout/client.js',
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

describe('loadRemote', () => {
  it('loads a module through native dynamic import', async () => {
    const remote = await loadRemote<{ default: string }>(
      'data:text/javascript,export default "loaded"',
    );

    expect(remote.default).toBe('loaded');
  });

  it('rejects an empty specifier with a clear error', async () => {
    await expect(loadRemote('')).rejects.toMatchObject({
      code: 'INVALID_SPECIFIER',
      name: 'BrowserImportError',
    });
  });

  it('wraps native import failures with the requested specifier', async () => {
    const error = await loadRemote('@mfe/missing').catch((error: unknown) => error);

    expect(error).toBeInstanceOf(BrowserImportError);
    expect(error).toMatchObject({
      code: 'REMOTE_IMPORT_FAILED',
      specifier: '@mfe/missing',
    });
  });
});
