import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export interface NextRemoteEntry {
  /** Native ESM module used by both the server bundle and the browser import map. */
  readonly url: string;
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
  readonly dir: string;
  readonly dev: boolean;
  readonly isServer: boolean;
  readonly buildId: string;
  /** Next.js keeps this config value intentionally open in its public type. */
  readonly config: unknown;
  readonly defaultLoaders: {
    readonly babel: unknown;
  };
  readonly totalPages: number;
  readonly webpack: unknown;
  readonly nextRuntime?: 'nodejs' | 'edge';
  readonly [key: string]: unknown;
}

type BivariantCallback<Arguments extends unknown[], Result> = {
  bivarianceHack(...args: Arguments): Result;
}['bivarianceHack'];

/**
 * Next.js declares its webpack callback with a more specific internal context type.
 * Bivariant parameters keep that callback assignable while still contextual-typing
 * callbacks written directly in a config passed to withNextRemoteEntries.
 */
export type NextWebpackConfigFunction = BivariantCallback<
  [config: NextWebpackConfig, context: NextWebpackContext],
  NextWebpackConfig
>;

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

export interface NextConfigLike {
  readonly webpack?: NextWebpackConfigFunction | null;
  readonly turbopack?: unknown;
  readonly [key: string]: unknown;
}

export type NextConfigWithRemoteEntries<T extends NextConfigLike> = Omit<
  T,
  'turbopack' | 'webpack'
> & {
  webpack: NextWebpackConfigFunction;
  turbopack: NextTurbopackConfig;
};

/**
 * Adds aliases for Native ESM remote entries to a Next.js configuration.
 *
 * Next bundles the same static import twice. Both builds point at the same
 * framework-independent remote module. Exact aliases use webpack's `$` suffix so a remote such as
 * `@mfe/cart` does not accidentally capture `@mfe/cart/button`.
 * Turbopack receives the same mapping through `turbopack.resolveAlias` for
 * both browser and server conditions.
 */
export function withNextRemoteEntries<T extends NextConfigLike>(
  nextConfig: T,
  options: NextIntegrationOptions,
): NextConfigWithRemoteEntries<T> {
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
      const remoteAliases = Object.fromEntries(
        Object.entries(options.entries).map(([specifier, entry]) => [
          toWebpackAlias(specifier),
          entry.url,
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
  } as NextConfigWithRemoteEntries<T>;
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
    .map((entry) => entry.url)
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
  const target = toTurbopackPath(entry.url);

  if (specifier.endsWith('/')) {
    return {
      browser: `${target.replace(/\/$/, '')}/*`,
      default: `${target.replace(/\/$/, '')}/*`,
    };
  }

  return {
    browser: target,
    default: target,
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
