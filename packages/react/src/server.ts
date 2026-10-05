import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import { createStateScript } from './serialize';
import { createReactRootMarker } from './types';
import type { ReactRemoteModule } from './types';

export interface RenderReactRemoteOptions<Props extends object, State = unknown> {
  remote: ReactRemoteModule<Props>;
  props: Props;
  rootId: string;
  state?: State;
  identifierPrefix?: string;
  onError?: (error: unknown) => void;
}

export interface RenderReactRemoteResult {
  html: string;
  rootId: string;
  stateScript?: string;
  identifierPrefix?: string;
}

export function renderReactRemote<Props extends object, State = unknown>(
  options: RenderReactRemoteOptions<Props, State>,
): RenderReactRemoteResult {
  createReactRootMarker(options.rootId);

  try {
    const html = renderToString(
      createElement(options.remote.default, options.props),
      options.identifierPrefix === undefined
        ? undefined
        : { identifierPrefix: options.identifierPrefix },
    );
    const stateScript =
      options.state === undefined ? undefined : createStateScript(options.rootId, options.state);

    return {
      html,
      rootId: options.rootId,
      stateScript,
      ...(options.identifierPrefix === undefined
        ? {}
        : { identifierPrefix: options.identifierPrefix }),
    };
  } catch (error) {
    options.onError?.(error);
    throw error;
  }
}
