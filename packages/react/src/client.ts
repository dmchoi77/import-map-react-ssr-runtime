import { createElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';

import type { ReactRemoteModule } from './types';

export interface ReactHydrationErrorInfo {
  componentStack?: string;
  errorBoundary?: unknown;
}

export type ReactHydrationErrorHandler = (
  error: unknown,
  errorInfo: ReactHydrationErrorInfo,
) => void;

export interface HydrateReactRemoteOptions<Props extends object> {
  remote: ReactRemoteModule<Props>;
  root: Element | Document;
  props: Props;
  identifierPrefix?: string;
  onCaughtError?: ReactHydrationErrorHandler;
  onUncaughtError?: ReactHydrationErrorHandler;
  onRecoverableError?: ReactHydrationErrorHandler;
}

export function hydrateReactRemote<Props extends object>(
  options: HydrateReactRemoteOptions<Props>,
): Root {
  const hydrationOptions: Parameters<typeof hydrateRoot>[2] = {
    ...(options.identifierPrefix === undefined
      ? {}
      : { identifierPrefix: options.identifierPrefix }),
    ...(options.onCaughtError === undefined ? {} : { onCaughtError: options.onCaughtError }),
    ...(options.onUncaughtError === undefined ? {} : { onUncaughtError: options.onUncaughtError }),
    ...(options.onRecoverableError === undefined
      ? {}
      : { onRecoverableError: options.onRecoverableError }),
  };

  return hydrateRoot(
    options.root,
    createElement(options.remote.default, options.props),
    hydrationOptions,
  );
}
