declare module '@example/tanstack-start/remote' {
  import type { ComponentType } from 'react';

  export interface RemoteAppProps {
    initial?: number;
  }

  export const RemoteApp: ComponentType<RemoteAppProps>;
}
