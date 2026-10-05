import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import { createHydrationScript } from './serialize';
import { createReactRootMarker } from './types';
import type { ReactHydrationContract, ReactRemoteModule } from './types';

export interface RenderReactRemoteOptions<Props extends object> {
  specifier: string;
  remote: ReactRemoteModule<Props>;
  props: Props;
  rootId?: string;
  identifierPrefix?: string;
}

let nextGeneratedRootId = 0;

export function renderReactRemote<Props extends object>(
  options: RenderReactRemoteOptions<Props>,
): string {
  if (typeof options.specifier !== 'string' || options.specifier.trim().length === 0) {
    throw new Error('specifier must be a non-empty string.');
  }
  if (options.props === null || typeof options.props !== 'object' || Array.isArray(options.props)) {
    throw new Error('props must be an object.');
  }

  const rootId = options.rootId ?? `mfe-react-${++nextGeneratedRootId}`;
  const marker = createReactRootMarker(rootId);
  const identifierPrefix = options.identifierPrefix ?? `${rootId}-`;
  const html = renderToString(createElement(options.remote.default, options.props), {
    identifierPrefix,
  });
  const contract: ReactHydrationContract<Props> = {
    specifier: options.specifier,
    props: options.props,
    identifierPrefix,
  };

  return [
    `<div id="${escapeHtmlAttribute(rootId)}" ${marker.attribute}="${escapeHtmlAttribute(marker.value)}">${html}</div>`,
    createHydrationScript(rootId, contract),
  ].join('');
}

function escapeHtmlAttribute(value: string): string {
  const replacements: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  return value.replace(/[&<>"']/g, (character) => replacements[character]);
}
