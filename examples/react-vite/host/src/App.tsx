import { RemoteApp } from '@example/react-vite/remote';

export function HostApp() {
  return (
    <>
      <output id="host-status">SSR ready</output>
      <RemoteApp initial={0} />
    </>
  );
}
