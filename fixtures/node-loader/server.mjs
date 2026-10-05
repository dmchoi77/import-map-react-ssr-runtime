import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const remoteSource = await readFile(new URL('./remote-http.mjs', import.meta.url));
const server = createServer((request, response) => {
  if (request.url !== '/remote-http.mjs') {
    response.writeHead(404);
    response.end();
    return;
  }

  response.writeHead(200, {
    'content-type': 'text/javascript',
  });
  response.end(remoteSource);
});

await new Promise((resolve) => {
  server.listen(4180, '127.0.0.1', resolve);
});

try {
  const fileRemote = await import('@mfe/file');
  const httpRemote = await import('@mfe/http');

  console.log(JSON.stringify({ file: fileRemote.source, http: httpRemote.source }));
} finally {
  server.close();
}
