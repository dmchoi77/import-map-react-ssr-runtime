export declare function createReactViteMiddleware(options?: {
  loadHostApp?: () => Promise<unknown>;
  clientPath?: string;
  remoteClientPath?: string;
  runtimeFiles?: Map<string, URL>;
}): (request: unknown, response: unknown, next: () => void) => Promise<void>;
export declare function createReactViteServer(options?: {
  httpServer?: unknown;
  host?: string;
  port?: number;
}): Promise<{
  origin: string;
  server: unknown;
  close: () => Promise<void>;
}>;
