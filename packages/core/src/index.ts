export type ResolverTarget = 'client' | 'server';

export type ManifestErrorCode =
  | 'INVALID_MANIFEST'
  | 'INVALID_SPECIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_URL'
  | 'CONFLICTING_ENTRY';

export interface RemoteManifestEntry {
  id: string;
  version: string;
  client: string;
  server: string;
  integrity?: {
    client?: string;
    server?: string;
  };
}

export interface RemoteManifest {
  imports: Record<string, RemoteManifestEntry>;
  scopes?: Record<string, Record<string, RemoteManifestEntry>>;
}

export interface ImportMap {
  imports: Record<string, string>;
  scopes?: Record<string, Record<string, string>>;
  integrity?: Record<string, string>;
}

export interface ManifestResolverOptions {
  baseUrl?: string;
}

export interface ImportMapResolver {
  resolve(specifier: string, parentUrl?: string): string | undefined;
}

export class ManifestError extends Error {
  readonly code: ManifestErrorCode;
  readonly path?: string;

  constructor(code: ManifestErrorCode, message: string, path?: string) {
    super(message);
    this.name = 'ManifestError';
    this.code = code;
    this.path = path;
  }
}

const DEFAULT_BASE_URL = 'https://mfe-ssr.invalid/';

export function validateManifest(
  manifest: unknown,
): asserts manifest is RemoteManifest {
  if (!isRecord(manifest) || !isRecord(manifest.imports)) {
    throw new ManifestError(
      'INVALID_MANIFEST',
      'Manifest must contain an imports object.',
      'imports',
    );
  }

  const entriesById = new Map<string, string>();
  validateMappings(manifest.imports, 'imports', entriesById);

  if (manifest.scopes !== undefined) {
    if (!isRecord(manifest.scopes)) {
      throw new ManifestError(
        'INVALID_MANIFEST',
        'Manifest scopes must be an object.',
        'scopes',
      );
    }

    for (const [scope, mappings] of Object.entries(manifest.scopes)) {
      validateScope(scope);
      if (!isRecord(mappings)) {
        throw new ManifestError(
          'INVALID_MANIFEST',
          'Scope mappings must be an object.',
          `scopes.${scope}`,
        );
      }
      validateMappings(mappings, `scopes.${scope}`, entriesById);
    }
  }
}

export function toImportMap(
  manifest: RemoteManifest,
  target: ResolverTarget,
): ImportMap {
  validateManifest(manifest);

  const importMap: ImportMap = {
    imports: toUrlMappings(manifest.imports, target),
  };

  if (manifest.scopes && Object.keys(manifest.scopes).length > 0) {
    importMap.scopes = Object.fromEntries(
      Object.entries(manifest.scopes).map(([scope, mappings]) => [
        scope,
        toUrlMappings(mappings, target),
      ]),
    );
  }

  const integrity = toIntegrityMappings(manifest, target);
  if (Object.keys(integrity).length > 0) {
    importMap.integrity = integrity;
  }

  return importMap;
}

export function createManifestResolver(
  manifest: RemoteManifest,
  target: ResolverTarget,
  options: ManifestResolverOptions = {},
): ImportMapResolver {
  validateManifest(manifest);

  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  assertAbsoluteUrl(baseUrl, 'baseUrl', target);

  const scopes = Object.entries(manifest.scopes ?? {})
    .map(([scope, mappings]) => ({
      scope,
      scopeUrl: new URL(scope, baseUrl).href,
      mappings,
    }))
    .sort((left, right) => right.scopeUrl.length - left.scopeUrl.length);

  return {
    resolve(specifier, parentUrl) {
      if (typeof specifier !== 'string' || specifier.length === 0) {
        throw new ManifestError(
          'INVALID_SPECIFIER',
          'Specifier must be a non-empty string.',
          'specifier',
        );
      }

      const scopedMappings = findScopedMappings(scopes, parentUrl, baseUrl);
      const scopedMatch = scopedMappings
        ? resolveMapping(scopedMappings, specifier, target, baseUrl)
        : undefined;

      return (
        scopedMatch ?? resolveMapping(manifest.imports, specifier, target, baseUrl)
      );
    },
  };
}

type ManifestMapping = Record<string, RemoteManifestEntry>;

function validateMappings(
  mappings: Record<string, unknown>,
  path: string,
  entriesById: Map<string, string>,
): void {
  for (const [specifier, rawEntry] of Object.entries(mappings)) {
    validateSpecifier(specifier, `${path}.${specifier}`);

    if (!isRecord(rawEntry)) {
      throw new ManifestError(
        'INVALID_MANIFEST',
        'Manifest mapping must contain an entry object.',
        `${path}.${specifier}`,
      );
    }

    const entry = rawEntry as Partial<RemoteManifestEntry>;
    validateEntry(entry, `${path}.${specifier}`);

    if (
      specifier.endsWith('/') &&
      (!entry.client.endsWith('/') || !entry.server.endsWith('/'))
    ) {
      throw new ManifestError(
        'INVALID_URL',
        'Prefix specifiers require both client and server addresses to end with /.',
        `${path}.${specifier}`,
      );
    }

    const fingerprint = JSON.stringify({
      version: entry.version,
      client: entry.client,
      server: entry.server,
      integrity: entry.integrity ?? {},
    });
    const previous = entriesById.get(entry.id);

    if (previous && previous !== fingerprint) {
      throw new ManifestError(
        'CONFLICTING_ENTRY',
        `Remote id "${entry.id}" is mapped to conflicting entries.`,
        `${path}.${specifier}`,
      );
    }

    entriesById.set(entry.id, fingerprint);
  }
}

function validateEntry(
  entry: Partial<RemoteManifestEntry>,
  path: string,
): asserts entry is RemoteManifestEntry {
  if (!isNonEmptyString(entry.id) || !isNonEmptyString(entry.version)) {
    throw new ManifestError(
      'INVALID_MANIFEST',
      'Each entry requires non-empty id and version strings.',
      path,
    );
  }

  assertModuleAddress(entry.client, `${path}.client`, 'client');
  assertModuleAddress(entry.server, `${path}.server`, 'server');

  if (entry.integrity !== undefined) {
    if (!isRecord(entry.integrity)) {
      throw new ManifestError(
        'INVALID_MANIFEST',
        'Integrity must be an object.',
        `${path}.integrity`,
      );
    }

    for (const [key, value] of Object.entries(entry.integrity)) {
      if (value !== undefined && !isNonEmptyString(value)) {
        throw new ManifestError(
          'INVALID_MANIFEST',
          'Integrity values must be non-empty strings.',
          `${path}.integrity.${key}`,
        );
      }
    }
  }
}

function validateSpecifier(specifier: string, path: string): void {
  if (specifier.trim() !== specifier || specifier.length === 0) {
    throw new ManifestError(
      'INVALID_SPECIFIER',
      'Import map specifiers must be non-empty and have no surrounding whitespace.',
      path,
    );
  }
}

function validateScope(scope: string): void {
  if (scope.trim() !== scope || scope.length === 0) {
    throw new ManifestError(
      'INVALID_SCOPE',
      'Import map scopes must be non-empty and have no surrounding whitespace.',
      `scopes.${scope}`,
    );
  }

  if (!scope.startsWith('/') && !isRelativeUrl(scope) && !isAbsoluteUrl(scope)) {
    throw new ManifestError(
      'INVALID_SCOPE',
      'Import map scopes must be URL paths or absolute URLs.',
      `scopes.${scope}`,
    );
  }
}

function assertModuleAddress(
  value: unknown,
  path: string,
  target: ResolverTarget,
): asserts value is string {
  if (!isNonEmptyString(value)) {
    throw new ManifestError(
      'INVALID_URL',
      'Module addresses must be non-empty strings.',
      path,
    );
  }

  const isRelative = isRelativeUrl(value) || value.startsWith('/');
  if (!isRelative && !isAbsoluteUrl(value)) {
    throw new ManifestError(
      'INVALID_URL',
      'Module addresses must be relative paths or absolute URLs.',
      path,
    );
  }

  if (isAbsoluteUrl(value)) {
    const protocol = new URL(value).protocol;
    const allowedProtocols = target === 'client'
      ? new Set(['http:', 'https:'])
      : new Set(['file:', 'http:', 'https:']);

    if (!allowedProtocols.has(protocol)) {
      throw new ManifestError(
        'INVALID_URL',
        `Protocol "${protocol}" is not allowed for ${target} module addresses.`,
        path,
      );
    }
  }

}

function assertAbsoluteUrl(
  value: unknown,
  path: string,
  target: ResolverTarget,
): asserts value is string {
  if (!isNonEmptyString(value) || !isAbsoluteUrl(value)) {
    throw new ManifestError(
      'INVALID_URL',
      'baseUrl must be an absolute URL.',
      path,
    );
  }

  const protocol = new URL(value).protocol;
  const allowedProtocols = target === 'client'
    ? new Set(['http:', 'https:'])
    : new Set(['file:', 'http:', 'https:']);

  if (!allowedProtocols.has(protocol)) {
    throw new ManifestError(
      'INVALID_URL',
      `Protocol "${protocol}" is not allowed for ${target} baseUrl.`,
      path,
    );
  }
}

function toUrlMappings(
  mappings: ManifestMapping,
  target: ResolverTarget,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(mappings).map(([specifier, entry]) => [specifier, entry[target]]),
  );
}

function toIntegrityMappings(
  manifest: RemoteManifest,
  target: ResolverTarget,
): Record<string, string> {
  const result: Record<string, string> = {};
  const allMappings = [
    ...Object.entries(manifest.imports),
    ...Object.values(manifest.scopes ?? {}).flatMap((mappings) => Object.entries(mappings)),
  ];

  for (const [specifier, entry] of allMappings) {
    const integrity = entry.integrity?.[target];
    if (integrity && !specifier.endsWith('/')) {
      result[entry[target]] = integrity;
    }
  }

  return result;
}

function findScopedMappings(
  scopes: Array<{ scopeUrl: string; mappings: ManifestMapping }>,
  parentUrl: string | undefined,
  baseUrl: string,
): ManifestMapping | undefined {
  if (parentUrl === undefined) {
    return undefined;
  }

  if (!isAbsoluteUrl(parentUrl)) {
    throw new ManifestError(
      'INVALID_URL',
      'parentUrl must be an absolute URL.',
      'parentUrl',
    );
  }

  const resolvedParentUrl = new URL(parentUrl, baseUrl).href;
  return scopes.find(({ scopeUrl }) => resolvedParentUrl.startsWith(scopeUrl))?.mappings;
}

function resolveMapping(
  mappings: ManifestMapping,
  specifier: string,
  target: ResolverTarget,
  baseUrl: string,
): string | undefined {
  const exactEntry = mappings[specifier];
  if (exactEntry) {
    return resolveAddress(exactEntry[target], baseUrl);
  }

  const prefix = Object.keys(mappings)
    .filter((key) => key.endsWith('/') && specifier.startsWith(key))
    .sort((left, right) => right.length - left.length)[0];

  if (!prefix) {
    return undefined;
  }

  const entry = mappings[prefix];
  const address = resolveAddress(entry[target], baseUrl);
  return new URL(specifier.slice(prefix.length), address).href;
}

function resolveAddress(address: string, baseUrl: string): string {
  return isAbsoluteUrl(address) ? address : new URL(address, baseUrl).href;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isAbsoluteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol.length > 0;
  } catch {
    return false;
  }
}

function isRelativeUrl(value: string): boolean {
  return value.startsWith('./') || value.startsWith('../');
}
