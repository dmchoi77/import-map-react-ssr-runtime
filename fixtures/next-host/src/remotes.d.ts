declare module '@mfe/basic/counter' {
  import type { ComponentType } from 'react';

  export interface RemoteAppProps {
    initial?: number;
  }

  export const RemoteApp: ComponentType<RemoteAppProps>;
  export default RemoteApp;
}

declare module '@mfe/basic/badge' {
  import type { ComponentType } from 'react';

  export const Badge: ComponentType;
  export default Badge;
}
