declare module '@example/next/remote' {
  import type { ComponentType } from 'react';

  export interface RemoteAppProps {
    initial?: number;
  }

  export const RemoteApp: ComponentType<RemoteAppProps>;
  export default RemoteApp;
}
