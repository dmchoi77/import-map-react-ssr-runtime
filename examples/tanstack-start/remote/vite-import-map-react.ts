import type { Plugin } from 'vite';

const browserModules = new Map([
  ['react', 'https://esm.sh/react@19.3.0'],
  ['react/jsx-runtime', 'https://esm.sh/react@19.3.0/jsx-runtime'],
  ['react/jsx-dev-runtime', 'https://esm.sh/react@19.3.0/jsx-dev-runtime'],
]);

export function useImportMapReactModules(): Plugin {
  return {
    name: 'example-tanstack-start-remote-import-map-react-modules',
    enforce: 'pre',
    resolveId(source, _importer, options) {
      if (options?.ssr) return;

      const url = browserModules.get(source);
      return url ? { id: url, external: true } : undefined;
    },
  };
}
