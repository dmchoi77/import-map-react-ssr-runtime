import type { ManifestResolverOptions, RemoteManifest } from '@mfe-ssr/core';
import type { MessagePort } from 'node:worker_threads';

import type { RemoteModuleCacheOptions } from './remote-fetcher';

export interface NodeLoaderOptions extends ManifestResolverOptions {
  allowedOrigins?: readonly string[];
  timeoutMs?: number;
  maxResponseBytes?: number;
  cache?: RemoteModuleCacheOptions;
}

export interface NodeLoaderData {
  manifest: RemoteManifest;
  options?: NodeLoaderOptions;
  diagnosticPort?: MessagePort;
}
