import type { ComponentType } from 'react';

export interface ReactRemoteMetadata {
  id?: string;
  version?: string;
}

export const REACT_ROOT_MARKER_ATTRIBUTE = 'data-mfe-react-root';
export const REACT_HYDRATION_DATA_ATTRIBUTE = 'data-mfe-react-hydration';

export interface ReactRootMarker {
  attribute: typeof REACT_ROOT_MARKER_ATTRIBUTE;
  value: string;
}

export function createReactRootMarker(rootId: string): ReactRootMarker {
  if (typeof rootId !== 'string' || rootId.trim().length === 0) {
    throw new Error('rootId must be a non-empty string.');
  }

  return {
    attribute: REACT_ROOT_MARKER_ATTRIBUTE,
    value: rootId,
  };
}

export interface ReactRemoteModule<Props extends object = Record<string, never>> {
  default: ComponentType<Props>;
  metadata?: ReactRemoteMetadata;
}

export interface ReactHydrationContract<Props extends object = Record<string, never>> {
  specifier: string;
  props: Props;
  identifierPrefix: string;
}
