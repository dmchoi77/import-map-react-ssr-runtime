export type FixturePage = 'home' | 'failure' | 'stream' | 'nested';

export interface HostAppProps {
  page: FixturePage;
}

export function HostApp({ page }: HostAppProps) {
  return (
    <output id="host-status" data-page={page}>
      SSR ready
    </output>
  );
}
