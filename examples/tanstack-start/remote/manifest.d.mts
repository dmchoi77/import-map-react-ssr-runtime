export interface BrowserRemoteManifest {
  imports: {
    '@example/tanstack-start/remote': {
      id: string;
      version: string;
      url: string;
    };
  };
}

export const manifest: BrowserRemoteManifest;
export function createBrowserManifest(remoteUrl?: string): BrowserRemoteManifest;
export default manifest;
