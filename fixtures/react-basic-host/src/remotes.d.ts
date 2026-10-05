declare module '@mfe/basic/counter' {
  import type { ComponentType } from 'react';

  export interface RemoteAppProps {
    initial?: number;
  }

  export const RemoteApp: ComponentType<RemoteAppProps>;
  export default RemoteApp;
}
