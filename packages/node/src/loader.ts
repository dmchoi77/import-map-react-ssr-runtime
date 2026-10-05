import type { LoadHook, ResolveHook } from 'node:module';

import { createNodeResolver } from './index';
import { RemoteModuleFetcher } from './remote-fetcher';
import type { NodeLoaderData } from './types';

let resolveRemote: ReturnType<typeof createNodeResolver> | undefined;
let fetcher: RemoteModuleFetcher | undefined;

export function initialize(data: NodeLoaderData): void {
  resolveRemote = createNodeResolver(data.manifest, data.options);
  fetcher = new RemoteModuleFetcher(data.options);
}

export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
  const mappedUrl = resolveRemote?.(specifier, context.parentURL);
  if (mappedUrl) {
    return {
      url: mappedUrl,
      shortCircuit: true,
    };
  }

  if (context.parentURL && isRemoteUrl(context.parentURL) && isRelativeSpecifier(specifier)) {
    return {
      url: new URL(specifier, context.parentURL).href,
      shortCircuit: true,
    };
  }

  return nextResolve(specifier, context);
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
    source: await fetcher.fetch(url),
    shortCircuit: true,
  };
};

function isRemoteUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

function isRelativeSpecifier(value: string): boolean {
  return value.startsWith('./') || value.startsWith('../') || value.startsWith('/');
}
