import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('../', import.meta.url));
const packageDirectories = [
  ['@mfe-ssr/core', 'packages/core'],
  ['@mfe-ssr/import-map', 'packages/import-map'],
  ['@mfe-ssr/node', 'packages/node'],
  ['@mfe-ssr/react', 'packages/react'],
];
const temporaryRoot = await mkdtemp(join(tmpdir(), 'mfe-package-consumer-'));

try {
  const tarballDirectory = join(temporaryRoot, 'tarballs');
  const consumerDirectory = join(temporaryRoot, 'consumer');
  const tarballs = new Map();
  await Promise.all([mkdir(tarballDirectory), mkdir(consumerDirectory)]);

  for (const [packageName, packageDirectory] of packageDirectories) {
    const before = new Set(await readdir(tarballDirectory));
    runPnpm(
      ['pack', '--pack-destination', tarballDirectory],
      join(workspaceRoot, packageDirectory),
    );
    const created = (await readdir(tarballDirectory)).filter((filename) => !before.has(filename));
    assert.equal(created.length, 1, `Expected one tarball for ${packageName}.`);
    tarballs.set(packageName, join(tarballDirectory, created[0]));
  }

  const reactDomDirectory = await realpath(join(workspaceRoot, 'node_modules/react-dom'));
  const installedRuntimePackages = [
    ['react', await realpath(join(workspaceRoot, 'node_modules/react'))],
    ['react-dom', reactDomDirectory],
    [
      'scheduler',
      dirname(createRequire(join(reactDomDirectory, 'package.json')).resolve('scheduler')),
    ],
  ];
  for (const [packageName, packageDirectory] of installedRuntimePackages) {
    const before = new Set(await readdir(tarballDirectory));
    runPnpm(['pack', '--pack-destination', tarballDirectory], packageDirectory);
    const created = (await readdir(tarballDirectory)).filter((filename) => !before.has(filename));
    assert.equal(created.length, 1, `Expected one local runtime tarball for ${packageName}.`);
    tarballs.set(packageName, join(tarballDirectory, created[0]));
  }

  const dependencies = Object.fromEntries(
    [...tarballs]
      .filter(([packageName]) => packageName.startsWith('@mfe-ssr/'))
      .map(([packageName, tarball]) => [
        packageName,
        `file:${relative(consumerDirectory, tarball)}`,
      ]),
  );
  for (const packageName of ['react', 'react-dom', 'scheduler']) {
    dependencies[packageName] = `file:${relative(consumerDirectory, tarballs.get(packageName))}`;
  }
  await writeFile(
    join(consumerDirectory, 'package.json'),
    `${JSON.stringify(
      {
        name: 'mfe-package-tarball-consumer',
        version: '0.0.0',
        private: true,
        type: 'module',
        dependencies,
      },
      null,
      2,
    )}\n`,
  );
  runNpm(
    [
      'install',
      '--offline',
      '--cache',
      join(temporaryRoot, 'npm-cache'),
      '--no-audit',
      '--no-fund',
    ],
    consumerDirectory,
  );

  await writeFile(
    join(consumerDirectory, 'index.mjs'),
    `import assert from 'node:assert/strict';
import React from 'react';
import * as core from '@mfe-ssr/core';
import * as importMap from '@mfe-ssr/import-map';
import * as nodeRuntime from '@mfe-ssr/node';
import * as reactRuntime from '@mfe-ssr/react';
import * as reactServer from '@mfe-ssr/react/server';

const manifest = {
  imports: {
    '@mfe/consumer': {
      id: '@mfe/consumer',
      version: '1.0.0',
      client: 'https://cdn.example.com/consumer/client.mjs',
      server: './remotes/consumer/server.mjs',
    },
  },
};

assert.equal(typeof core.createManifestResolver, 'function');
assert.equal(typeof nodeRuntime.registerNodeLoader, 'function');
assert.equal(typeof importMap.createBrowserImportMap, 'function');
assert.equal(typeof importMap.serializeImportMap, 'function');
assert.equal(reactRuntime.renderReactRemote, reactServer.renderReactRemote);

const browserMap = importMap.createBrowserImportMap(manifest);
assert.equal(browserMap.imports['@mfe/consumer'], manifest.imports['@mfe/consumer'].client);
assert.match(importMap.serializeImportMap(browserMap), /cdn\\.example\\.com/);

const resolveRemote = nodeRuntime.createNodeResolver(manifest, {
  baseUrl: 'file:///consumer/',
});
assert.equal(resolveRemote('@mfe/consumer'), 'file:///consumer/remotes/consumer/server.mjs');

const markup = reactServer.renderReactRemote({
  specifier: '@mfe/consumer',
  remote: { default: ({ name }) => React.createElement('p', null, name) },
  props: { name: 'Packed consumer' },
  rootId: 'packed-consumer-root',
});
assert.match(markup, /Packed consumer/);
assert.match(markup, /data-mfe-react-hydration="packed-consumer-root"/);

await import('@mfe-ssr/react/bootstrap');
console.log('Tarball consumer smoke passed.');
`,
  );
  runNode(join(consumerDirectory, 'index.mjs'), consumerDirectory);
  console.log('All package tarballs installed and imported from an isolated consumer.');
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

function runPnpm(args, cwd) {
  return runCommand('pnpm', args, cwd);
}

function runNpm(args, cwd) {
  return runCommand('npm', args, cwd);
}

function runCommand(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed in ${cwd}.\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout;
}

function runNode(entry, cwd) {
  const result = spawnSync(process.execPath, [entry], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `Consumer import failed.\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Tarball consumer smoke passed/);
}
