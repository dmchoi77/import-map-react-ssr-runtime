import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export interface NextRemoteEntry {
  readonly client: string;
  readonly server: string;
}

export type NextRemoteEntries = Readonly<Record<string, NextRemoteEntry>>;

export interface NextIntegrationOptions {
  readonly entries: NextRemoteEntries;
  readonly turbopackRoot?: string;
}

export interface NextWebpackConfig {
  resolve?: {
    alias?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface NextWebpackContext {
  readonly isServer: boolean;
  readonly [key: string]: unknown;
}

export type NextWebpackConfigFunction = (
  config: NextWebpackConfig,
  context: NextWebpackContext,
) => NextWebpackConfig;

export type NextTurbopackAlias = string | string[] | NextTurbopackConditionalAlias;

export interface NextTurbopackConditionalAlias {
  readonly browser?: string | string[];
  readonly default?: string | string[];
  readonly [condition: string]: string | string[] | undefined;
}

export interface NextTurbopackConfig {
  root?: string;
  resolveAlias?: Record<string, NextTurbopackAlias>;
  readonly [key: string]: unknown;
}

export type NextConfigLike = object;

/**
 * Adds server/client aliases for remote entries to a Next.js configuration.
 *
 * Next bundles the same static import twice. The server build must point at a
 * remote's server entry, while the browser build must point at its client
 * entry. Exact aliases use webpack's `$` suffix so a remote such as
 * `@mfe/cart` does not accidentally capture `@mfe/cart/button`.
 * Turbopack receives the same mapping through `turbopack.resolveAlias` with
 * its browser condition selecting the client entry and the default condition
 * selecting the server entry.
 */
export function withNextRemoteEntries<T extends NextConfigLike>(
  nextConfig: T,
  options: NextIntegrationOptions,
): T & { webpack: NextWebpackConfigFunction; turbopack: NextTurbopackConfig } {
  const previousWebpack = getWebpackConfigFunction(nextConfig);
  const previousTurbopack = getTurbopackConfig(nextConfig);
  const turbopackRoot = getTurbopackRoot(nextConfig, options, previousTurbopack);
  const turbopackAliases = Object.fromEntries(
    Object.entries(options.entries).map(([specifier, entry]) => [
      toTurbopackAlias(specifier),
      toTurbopackTarget(specifier, entry),
    ]),
  );

  return {
    ...nextConfig,
    webpack(config, context) {
      const resolvedConfig = previousWebpack ? previousWebpack(config, context) : config;
      const aliases = resolvedConfig.resolve?.alias ?? {};
      const target = context.isServer ? 'server' : 'client';
      const remoteAliases = Object.fromEntries(
        Object.entries(options.entries).map(([specifier, entry]) => [
          toWebpackAlias(specifier),
          entry[target],
        ]),
      );

      return {
        ...resolvedConfig,
        resolve: {
          ...resolvedConfig.resolve,
          alias: {
            ...aliases,
            ...remoteAliases,
          },
        },
      };
    },
    turbopack: {
      ...previousTurbopack,
      ...(turbopackRoot ? { root: turbopackRoot } : {}),
      resolveAlias: {
        ...previousTurbopack?.resolveAlias,
        ...turbopackAliases,
      },
    },
  } as T & { webpack: NextWebpackConfigFunction; turbopack: NextTurbopackConfig };
}

function getWebpackConfigFunction(nextConfig: object): NextWebpackConfigFunction | undefined {
  const webpack = (nextConfig as { webpack?: unknown }).webpack;
  return typeof webpack === 'function' ? (webpack as NextWebpackConfigFunction) : undefined;
}

function getTurbopackConfig(nextConfig: object): NextTurbopackConfig | undefined {
  const turbopack = (nextConfig as { turbopack?: unknown }).turbopack;
  return isRecord(turbopack) ? (turbopack as NextTurbopackConfig) : undefined;
}

function getTurbopackRoot(
  nextConfig: object,
  options: NextIntegrationOptions,
  previousTurbopack: NextTurbopackConfig | undefined,
): string | undefined {
  const outputFileTracingRoot = (nextConfig as { outputFileTracingRoot?: unknown })
    .outputFileTracingRoot;
  if (previousTurbopack?.root) return previousTurbopack.root;
  if (options.turbopackRoot) return resolve(options.turbopackRoot);
  if (typeof outputFileTracingRoot === 'string') return outputFileTracingRoot;

  const absoluteEntryPaths = Object.values(options.entries)
    .flatMap((entry) => [entry.client, entry.server])
    .filter(isAbsolute)
    .map((entryPath) => dirname(entryPath));

  return absoluteEntryPaths.length > 0
    ? absoluteEntryPaths.reduce(findCommonAncestor, resolve(process.cwd()))
    : undefined;
}

function toWebpackAlias(specifier: string): string {
  return specifier.endsWith('/') ? specifier : `${specifier}$`;
}

function toTurbopackAlias(specifier: string): string {
  return specifier.endsWith('/') ? `${specifier}*` : specifier;
}

function toTurbopackTarget(
  specifier: string,
  entry: NextRemoteEntry,
): NextTurbopackConditionalAlias {
  const client = toTurbopackPath(entry.client);
  const server = toTurbopackPath(entry.server);

  if (specifier.endsWith('/')) {
    return {
      browser: `${client.replace(/\/$/, '')}/*`,
      default: `${server.replace(/\/$/, '')}/*`,
    };
  }

  return {
    browser: client,
    default: server,
  };
}

function toTurbopackPath(entryPath: string): string {
  if (!isAbsolute(entryPath)) return entryPath;

  const relativePath = relative(process.cwd(), entryPath).split(sep).join('/');
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

function findCommonAncestor(left: string, right: string): string {
  let ancestor = left;
  while (!isWithin(right, ancestor)) ancestor = dirname(ancestor);
  return ancestor;
}

function isWithin(path: string, parent: string): boolean {
  const relativePath = relative(parent, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
