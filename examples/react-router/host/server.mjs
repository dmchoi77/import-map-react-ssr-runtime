import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createReactRouterServer } from './src/react-router-server.mjs';

export {
  createReactRouterMiddleware,
  createReactRouterServer,
} from './src/react-router-server.mjs';

async function start() {
  const example = await createReactRouterServer({
    httpServer: createServer(),
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 5220),
  });
  console.log(`READY ${example.origin}`);

  const shutdown = () => void example.close();
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void start();
}
