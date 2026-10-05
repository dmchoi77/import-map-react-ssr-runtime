import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface RemoteModuleCacheOptions {
  /** Directory for persistent cache records. Persistence is disabled when omitted. */
  directory?: string;
  /** Time a verified entry remains fresh. Defaults to one minute. */
  ttlMs?: number;
  /** Maximum aggregate module bytes retained by each cache layer. Defaults to 64 MiB. */
  maxSizeBytes?: number;
  /** Optional stale window served while a background revalidation runs. Defaults to disabled. */
  staleWhileRevalidateMs?: number;
}

interface RemoteCacheEntry {
  key: string;
  url: string;
  integrity: string | null;
  storedAt: number;
  bytes: Buffer;
}

interface PersistedRemoteCacheEntry {
  version: 1;
  key: string;
  url: string;
  integrity: string | null;
  storedAt: number;
  body: string;
}

interface PendingCacheWrite {
  url: string;
  integrity: string | null;
  promise: Promise<void>;
}

export interface RemoteCacheHit {
  bytes: Buffer;
  stale: boolean;
}

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_SIZE_BYTES = 64 * 1024 * 1024;
const CACHE_FILE_PREFIX = 'mfe-cache-';

export class RemoteModuleCache {
  private readonly entries = new Map<string, RemoteCacheEntry>();
  private readonly directory?: string;
  private readonly ttlMs: number;
  private readonly maxSizeBytes: number;
  private readonly staleWhileRevalidateMs: number;
  private entriesSizeBytes = 0;
  private readonly pendingWrites = new Map<string, PendingCacheWrite>();

  constructor(options: RemoteModuleCacheOptions = {}) {
    if (options.directory !== undefined && options.directory.trim().length === 0) {
      throw new RangeError('cache.directory must be a non-empty path.');
    }
    this.directory = options.directory === undefined ? undefined : resolve(options.directory);
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
    this.staleWhileRevalidateMs = options.staleWhileRevalidateMs ?? 0;

    if (!Number.isFinite(this.ttlMs) || this.ttlMs <= 0) {
      throw new RangeError('cache.ttlMs must be a positive finite number.');
    }
    if (!Number.isFinite(this.maxSizeBytes) || this.maxSizeBytes <= 0) {
      throw new RangeError('cache.maxSizeBytes must be a positive finite number.');
    }
    if (!Number.isFinite(this.staleWhileRevalidateMs) || this.staleWhileRevalidateMs < 0) {
      throw new RangeError('cache.staleWhileRevalidateMs must be a non-negative finite number.');
    }
  }

  get size(): number {
    return this.entries.size;
  }

  async get(
    key: string,
    url: string,
    integrity: string | undefined,
    validate: (bytes: Uint8Array) => void,
  ): Promise<RemoteCacheHit | undefined> {
    let entry = this.entries.get(key);
    if (!entry && this.directory) {
      entry = await this.readPersistentEntry(key, url, integrity);
    }
    if (!entry) return undefined;

    try {
      validate(entry.bytes);
    } catch {
      await this.deleteEntry(key);
      return undefined;
    }

    const ageMs = Math.max(0, Date.now() - entry.storedAt);
    if (ageMs > this.ttlMs + this.staleWhileRevalidateMs) {
      await this.deleteEntry(key);
      return undefined;
    }

    this.remember(entry);
    if (this.directory) {
      await this.touchPersistentEntry(key);
    }
    return { bytes: entry.bytes, stale: ageMs > this.ttlMs };
  }

  async set(
    key: string,
    url: string,
    integrity: string | undefined,
    bytes: Uint8Array,
  ): Promise<void> {
    if (bytes.byteLength > this.maxSizeBytes) return;

    const entry: RemoteCacheEntry = {
      key,
      url,
      integrity: integrity ?? null,
      storedAt: Date.now(),
      bytes: Buffer.from(bytes),
    };
    this.remember(entry);
    if (!this.directory) return;

    const cachePath = this.filePath(key);
    const temporaryPath = join(
      this.directory,
      `${CACHE_FILE_PREFIX}${this.fileName(key)}.${randomUUID()}.tmp`,
    );
    const persisted: PersistedRemoteCacheEntry = {
      version: 1,
      key,
      url,
      integrity: integrity ?? null,
      storedAt: entry.storedAt,
      body: entry.bytes.toString('base64'),
    };

    const promise = this.writePersistentEntry(cachePath, temporaryPath, persisted);
    const pendingWrite: PendingCacheWrite = {
      url,
      integrity: integrity ?? null,
      promise,
    };
    this.pendingWrites.set(key, pendingWrite);
    try {
      await promise;
    } finally {
      if (this.pendingWrites.get(key) === pendingWrite) this.pendingWrites.delete(key);
    }
  }

  async invalidate(url: string, integrity?: string): Promise<void> {
    await Promise.all(
      [...this.pendingWrites.values()]
        .filter(
          (write) =>
            write.url === url && (integrity === undefined || write.integrity === integrity),
        )
        .map((write) => write.promise),
    );
    for (const [key, entry] of this.entries) {
      if (entry.url === url && (integrity === undefined || entry.integrity === integrity)) {
        this.removeMemoryEntry(key);
      }
    }
    if (!this.directory) return;

    for (const { path, entry } of await this.readDirectoryEntries()) {
      if (entry.url === url && (integrity === undefined || entry.integrity === integrity)) {
        await rm(path, { force: true });
        this.removeMemoryEntry(entry.key);
      }
    }
  }

  async clear(): Promise<void> {
    await Promise.all([...this.pendingWrites.values()].map((write) => write.promise));
    this.entries.clear();
    this.entriesSizeBytes = 0;
    if (!this.directory) return;

    for (const filename of await this.readOwnedFilenames()) {
      await rm(join(this.directory, filename), { force: true });
    }
  }

  private remember(entry: RemoteCacheEntry): void {
    this.removeMemoryEntry(entry.key);
    if (entry.bytes.byteLength > this.maxSizeBytes) return;

    this.entries.set(entry.key, entry);
    this.entriesSizeBytes += entry.bytes.byteLength;
    while (this.entriesSizeBytes > this.maxSizeBytes) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      this.removeMemoryEntry(oldestKey);
    }
  }

  private removeMemoryEntry(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.entriesSizeBytes -= entry.bytes.byteLength;
  }

  private async readPersistentEntry(
    key: string,
    url: string,
    integrity: string | undefined,
  ): Promise<RemoteCacheEntry | undefined> {
    const cachePath = this.filePath(key);
    try {
      const persisted = JSON.parse(
        await readFile(cachePath, 'utf8'),
      ) as Partial<PersistedRemoteCacheEntry>;
      if (
        persisted.version !== 1 ||
        persisted.key !== key ||
        persisted.url !== url ||
        persisted.integrity !== (integrity ?? null) ||
        typeof persisted.storedAt !== 'number' ||
        !Number.isFinite(persisted.storedAt) ||
        typeof persisted.body !== 'string'
      ) {
        await rm(cachePath, { force: true });
        return undefined;
      }

      const bytes = Buffer.from(persisted.body, 'base64');
      if (bytes.toString('base64') !== persisted.body || bytes.byteLength > this.maxSizeBytes) {
        await rm(cachePath, { force: true });
        return undefined;
      }

      const entry: RemoteCacheEntry = {
        key,
        url,
        integrity: integrity ?? null,
        storedAt: persisted.storedAt,
        bytes,
      };
      this.remember(entry);
      return entry;
    } catch {
      await rm(cachePath, { force: true }).catch(() => {});
      return undefined;
    }
  }

  private async writePersistentEntry(
    cachePath: string,
    temporaryPath: string,
    persisted: PersistedRemoteCacheEntry,
  ): Promise<void> {
    try {
      await mkdir(this.directory!, { recursive: true, mode: 0o700 });
      await writeFile(temporaryPath, JSON.stringify(persisted), {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      await rename(temporaryPath, cachePath);
      await this.prunePersistentEntries();
    } catch {
      await rm(temporaryPath, { force: true }).catch(() => {});
    }
  }

  private async deleteEntry(key: string): Promise<void> {
    this.removeMemoryEntry(key);
    if (this.directory) {
      await rm(this.filePath(key), { force: true }).catch(() => {});
    }
  }

  private async touchPersistentEntry(key: string): Promise<void> {
    const now = new Date();
    await utimes(this.filePath(key), now, now).catch(() => {});
  }

  private async prunePersistentEntries(): Promise<void> {
    const entries = await this.readDirectoryEntries();
    entries.sort((left, right) => left.modifiedAt - right.modifiedAt);
    let totalBytes = entries.reduce((total, { entry }) => total + entry.bodyBytes, 0);

    while (totalBytes > this.maxSizeBytes && entries.length > 0) {
      const oldest = entries.shift();
      if (!oldest) break;
      await rm(oldest.path, { force: true });
      totalBytes -= oldest.entry.bodyBytes;
      this.removeMemoryEntry(oldest.entry.key);
    }
  }

  private async readDirectoryEntries(): Promise<
    Array<{
      path: string;
      modifiedAt: number;
      entry: { key: string; url: string; integrity: string | null; bodyBytes: number };
    }>
  > {
    const entries: Array<{
      path: string;
      modifiedAt: number;
      entry: { key: string; url: string; integrity: string | null; bodyBytes: number };
    }> = [];
    if (!this.directory) return entries;

    for (const filename of await this.readCacheFilenames()) {
      const path = join(this.directory, filename);
      try {
        const [source, fileStats] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
        const persisted = JSON.parse(source) as Partial<PersistedRemoteCacheEntry>;
        if (
          persisted.version !== 1 ||
          typeof persisted.key !== 'string' ||
          typeof persisted.url !== 'string' ||
          (persisted.integrity !== null && typeof persisted.integrity !== 'string') ||
          typeof persisted.body !== 'string'
        ) {
          await rm(path, { force: true });
          continue;
        }
        const body = Buffer.from(persisted.body, 'base64');
        if (body.toString('base64') !== persisted.body) {
          await rm(path, { force: true });
          continue;
        }
        entries.push({
          path,
          modifiedAt: fileStats.mtimeMs,
          entry: {
            key: persisted.key,
            url: persisted.url,
            integrity: persisted.integrity,
            bodyBytes: body.byteLength,
          },
        });
      } catch {
        await rm(path, { force: true }).catch(() => {});
      }
    }
    return entries;
  }

  private async readCacheFilenames(): Promise<string[]> {
    return (await this.readOwnedFilenames()).filter((filename) => filename.endsWith('.json'));
  }

  private async readOwnedFilenames(): Promise<string[]> {
    if (!this.directory) return [];
    try {
      return (await readdir(this.directory)).filter((filename) => {
        return (
          filename.startsWith(CACHE_FILE_PREFIX) &&
          (filename.endsWith('.json') || filename.endsWith('.tmp'))
        );
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  private filePath(key: string): string {
    return join(this.directory!, `${CACHE_FILE_PREFIX}${this.fileName(key)}.json`);
  }

  private fileName(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }
}
