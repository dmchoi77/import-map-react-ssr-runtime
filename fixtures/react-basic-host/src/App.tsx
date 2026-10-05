import { RemoteApp } from '@mfe/basic/counter';

export function HostApp() {
  return (
    <>
      <output id="host-status">SSR ready</output>
      <RemoteApp initial={0} />
    </>
  );
}
