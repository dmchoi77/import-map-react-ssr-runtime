import { createManifestResolver, type ImportMapResolver, type RemoteManifest } from '@mfe-ssr/core';
import { pathToFileURL } from 'node:url';

import type { NodeLoaderOptions } from './types';
export {
  RemoteModuleError,
  RemoteModuleFetcher,
  type RemoteModuleErrorCode,
  type RemoteModuleFetcherOptions,
} from './remote-fetcher';

export type { NodeLoaderData, NodeLoaderOptions } from './types';
export { registerNodeLoader } from './preload';

export type NodeResolver = ImportMapResolver['resolve'];
export type NodeResolverOptions = NodeLoaderOptions;

const DEFAULT_BASE_URL = pathToFileURL(`${process.cwd()}/`).href;

export function createNodeResolver(
  manifest: RemoteManifest,
  options: NodeResolverOptions = {},
): NodeResolver {
  const resolver = createManifestResolver(manifest, 'server', {
    ...options,
    baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
  });
  return resolver.resolve;
}
