import { register } from 'node:module';

import type { RemoteManifest } from '@mfe-ssr/core';

import type { NodeLoaderOptions } from './types';

export function registerNodeLoader(
  manifest: RemoteManifest,
  options: NodeLoaderOptions = {},
): void {
  register(new URL('./loader.mjs', import.meta.url), {
    parentURL: import.meta.url,
    data: {
      manifest,
      options,
    },
  });
}
