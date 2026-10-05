import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const remoteSpecifier = '@mfe/node-loader-integration';
const modulePath = '/entry.mjs';
const entrySource =
  'import { answer as baseAnswer } from "./dependency.mjs"; export const dependency = baseAnswer; export const answer = baseAnswer + 1; export default answer;';
const requestedPaths = new Map();
let blockedRequestCount = 0;
const allowedServer = createServer(handleAllowedRequest);
const blockedServer = createServer((_request, response) => {
  blockedRequestCount += 1;
  response.writeHead(200, { 'content-type': 'text/javascript' });
  response.end('export default "should not load";');
});

let allowedOrigin;
let blockedOrigin;
let testDirectory;
let preloadIndex = 0;

before(async () => {
  testDirectory = await mkdtemp(join(tmpdir(), 'mfe-node-loader-'));
  allowedOrigin = await listen(allowedServer);
  blockedOrigin = await listen(blockedServer);
});

after(async () => {
  await Promise.all([close(allowedServer), close(blockedServer)]);
  if (testDirectory) {
    await rm(testDirectory, { recursive: true, force: true });
  }
});

test('loads an HTTP remote and its relative dependency through node --import', async () => {
  requestedPaths.clear();
  const report = await importRemote(
    `${allowedOrigin}${modulePath}`,
    {},
    {
      '@mfe/integrity-alias': {
        id: '@mfe/integrity-alias',
        version: '1.0.0',
        client: 'https://fixture.invalid/dependency.mjs',
        server: `${allowedOrigin}/dependency.mjs`,
        integrity: { server: integrityFor('export const answer = 41;') },
      },
    },
    integrityFor(entrySource),
  );

  assert.deepEqual(report, { ok: true, answer: 42, dependency: 41 });
  assert.equal(requestedPaths.get('/entry.mjs'), 1);
  assert.equal(requestedPaths.get('/dependency.mjs'), 1);
});

test('reuses the persistent remote cache after restarting the Node process', async () => {
  requestedPaths.clear();
  const cacheDirectory = join(testDirectory, 'persistent-remote-cache');
  const cacheOptions = {
    directory: cacheDirectory,
    ttlMs: 60_000,
    maxSizeBytes: 4_096,
  };
  const serverUrl = `${allowedOrigin}/persistent.mjs`;
  const integrity = integrityFor('export default "persistent";');

  const first = await importRemote(serverUrl, { cache: cacheOptions }, {}, integrity);
  const restarted = await importRemote(serverUrl, { cache: cacheOptions }, {}, integrity);

  assert.deepEqual(first, { ok: true, answer: 'persistent' });
  assert.deepEqual(restarted, first);
  assert.equal(requestedPaths.get('/persistent.mjs'), 1);
});

test('rejects a tampered relative dependency before evaluating its source', async () => {
  const report = await importRemote(
    `${allowedOrigin}/entry-with-tampered-dependency.mjs`,
    {},
    {
      '@mfe/tampered-alias': {
        id: '@mfe/tampered-alias',
        version: '1.0.0',
        client: 'https://fixture.invalid/tampered.mjs',
        server: `${allowedOrigin}/tampered.mjs`,
        integrity: { server: integrityFor('export const safe = true;') },
      },
    },
    integrityFor('import "./tampered.mjs"; export const ok = true;'),
  );

  assert.equal(report.ok, false);
  assert.equal(report.integrityExecuted, false);
  assert.match(report.message, /integrity/i);
});

test('rejects an HTTP remote outside the configured origin allowlist', async () => {
  blockedRequestCount = 0;
  const report = await importRemote(`${blockedOrigin}${modulePath}`);

  assert.equal(report.ok, false);
  assert.match(report.message, /is not allowed/);
  assert.equal(blockedRequestCount, 0);
});

test('enforces timeout and response-size limits for real HTTP responses', async () => {
  const timeout = await importRemote(`${allowedOrigin}/slow.mjs`, { timeoutMs: 25 });
  assert.equal(timeout.ok, false);
  assert.match(timeout.message, /exceeded 25ms/);

  const oversized = await importRemote(`${allowedOrigin}/large.mjs`, { maxResponseBytes: 32 });
  assert.equal(oversized.ok, false);
  assert.match(oversized.message, /exceeds 32 bytes/);
});

function handleAllowedRequest(request, response) {
  const path = new URL(request.url ?? '/', allowedOrigin ?? 'http://127.0.0.1').pathname;
  requestedPaths.set(path, (requestedPaths.get(path) ?? 0) + 1);

  if (path === '/entry.mjs') {
    response.writeHead(200, { 'content-type': 'text/javascript' });
    response.end(entrySource);
    return;
  }

  if (path === '/entry-with-tampered-dependency.mjs') {
    response.writeHead(200, { 'content-type': 'text/javascript' });
    response.end('import "./tampered.mjs"; export const ok = true;');
    return;
  }

  if (path === '/persistent.mjs') {
    response.writeHead(200, { 'content-type': 'text/javascript' });
    response.end('export default "persistent";');
    return;
  }

  if (path === '/dependency.mjs') {
    response.writeHead(200, { 'content-type': 'text/javascript' });
    response.end('export const answer = 41;');
    return;
  }

  if (path === '/tampered.mjs') {
    response.writeHead(200, { 'content-type': 'text/javascript' });
    response.end('globalThis.__mfeIntegrityExecuted = true; export const safe = false;');
    return;
  }

  if (path === '/slow.mjs') {
    setTimeout(() => {
      response.writeHead(200, { 'content-type': 'text/javascript' });
      response.end('export default "slow";');
    }, 150);
    return;
  }

  if (path === '/large.mjs') {
    response.writeHead(200, { 'content-type': 'text/javascript' });
    response.end('x'.repeat(128));
    return;
  }

  response.writeHead(404);
  response.end();
}

async function importRemote(serverUrl, overrides = {}, additionalEntries = {}, rootIntegrity) {
  const preloadUrl = new URL('../dist/index.mjs', import.meta.url).href;
  const preloadPath = join(testDirectory, `preload-${preloadIndex++}.mjs`);
  const manifest = {
    imports: {
      [remoteSpecifier]: {
        id: remoteSpecifier,
        version: '1.0.0',
        client: 'https://fixture.invalid/client.mjs',
        server: serverUrl,
        ...(rootIntegrity ? { integrity: { server: rootIntegrity } } : {}),
      },
      ...additionalEntries,
    },
  };
  const options = {
    allowedOrigins: [allowedOrigin],
    timeoutMs: 1_000,
    maxResponseBytes: 4_096,
    ...overrides,
  };

  await writeFile(
    preloadPath,
    `import { registerNodeLoader } from ${JSON.stringify(preloadUrl)};\n` +
      `registerNodeLoader(${JSON.stringify(manifest)}, ${JSON.stringify(options)});\n`,
  );

  const source = `
    try {
      const remote = await import(${JSON.stringify(remoteSpecifier)});
      console.log(JSON.stringify({ ok: true, answer: remote.default, dependency: remote.dependency }));
    } catch (error) {
      console.log(JSON.stringify({ ok: false, name: error.name, code: error.code, message: error.message, integrityExecuted: globalThis.__mfeIntegrityExecuted === true }));
    }
  `;
  const result = await runNode(['--import', preloadPath, '--input-type=module', '--eval', source]);

  assert.equal(result.code, 0, result.stderr);
  const output = result.stdout.trim().split('\n').at(-1);
  assert.ok(output, `Expected child process to report an import result. stderr: ${result.stderr}`);
  return JSON.parse(output);
}

function integrityFor(source) {
  return `sha384-${createHash('sha384').update(source).digest('base64')}`;
}

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: fileURLToPath(new URL('../../../', import.meta.url)),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => child.kill('SIGKILL'), 10_000);

    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Expected the fixture server to bind to a TCP port.'));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
