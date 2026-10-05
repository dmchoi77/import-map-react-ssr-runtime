import type { ManifestResolverOptions, RemoteManifest } from '@mfe-ssr/core';

export interface NodeLoaderOptions extends ManifestResolverOptions {
  allowedOrigins?: readonly string[];
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export interface NodeLoaderData {
  manifest: RemoteManifest;
  options?: NodeLoaderOptions;
}
