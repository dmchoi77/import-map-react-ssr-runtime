declare module '@mfe/fixture/counter' {
  import type { ComponentType } from 'react';

  const Counter: ComponentType<{
    label: string;
    state?: { count: number };
  }>;

  export default Counter;
}

declare module '@mfe/fixture/profile' {
  import type { ComponentType } from 'react';

  const Profile: ComponentType<{ name: string }>;

  export default Profile;
}
