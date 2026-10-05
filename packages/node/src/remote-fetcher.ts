import { createHash, timingSafeEqual } from 'node:crypto';

export type RemoteModuleErrorCode =
  | 'INVALID_REMOTE_INTEGRITY'
  | 'INVALID_REMOTE_URL'
  | 'REMOTE_ORIGIN_NOT_ALLOWED'
  | 'REMOTE_FETCH_FAILED'
  | 'REMOTE_FETCH_TIMEOUT'
  | 'REMOTE_HTTP_ERROR'
  | 'REMOTE_INTEGRITY_MISMATCH'
  | 'REMOTE_RESPONSE_TOO_LARGE';

export interface RemoteModuleFetcherOptions {
  allowedOrigins?: readonly string[];
  timeoutMs?: number;
  maxResponseBytes?: number;
  fetch?: typeof globalThis.fetch;
}

export class RemoteModuleError extends Error {
  readonly code: RemoteModuleErrorCode;
  readonly url: string;
  readonly status?: number;

  constructor(
    code: RemoteModuleErrorCode,
    message: string,
    url: string,
    options: { cause?: unknown; status?: number } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'RemoteModuleError';
    this.code = code;
    this.url = url;
    this.status = options.status;
  }
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const INTEGRITY_ALGORITHMS = {
  sha256: 32,
  sha384: 48,
  sha512: 64,
} as const;
type IntegrityAlgorithm = keyof typeof INTEGRITY_ALGORITHMS;
interface IntegrityDigest {
  algorithm: IntegrityAlgorithm;
  digest: Buffer;
}

export class RemoteModuleFetcher {
  private readonly allowedOrigins: ReadonlySet<string>;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly cache = new Map<string, Promise<string>>();

  constructor(options: RemoteModuleFetcherOptions = {}) {
    this.allowedOrigins = new Set(
      (options.allowedOrigins ?? []).map((origin) => {
        return new URL(origin).origin;
      }),
    );
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    this.fetchImpl = options.fetch ?? globalThis.fetch;

    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new RangeError('timeoutMs must be a positive finite number.');
    }

    if (!Number.isFinite(this.maxResponseBytes) || this.maxResponseBytes <= 0) {
      throw new RangeError('maxResponseBytes must be a positive finite number.');
    }
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }

  async fetch(url: string, integrity?: string): Promise<string> {
    const normalizedUrl = this.assertAllowedUrl(url);
    const integrityDigests = integrity === undefined ? undefined : parseIntegrity(integrity, url);
    const cacheKey = JSON.stringify([normalizedUrl, integrity ?? null]);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const request = this.fetchUncached(normalizedUrl, integrityDigests);
    this.cache.set(cacheKey, request);

    return request.catch((error: unknown) => {
      if (this.cache.get(cacheKey) === request) {
        this.cache.delete(cacheKey);
      }
      throw error;
    });
  }

  private assertAllowedUrl(url: string): string {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch (cause) {
      throw new RemoteModuleError('INVALID_REMOTE_URL', 'Remote URL must be absolute.', url, {
        cause,
      });
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new RemoteModuleError(
        'INVALID_REMOTE_URL',
        'Remote fetch only supports http(s) URLs.',
        url,
      );
    }

    if (!this.allowedOrigins.has(parsedUrl.origin)) {
      throw new RemoteModuleError(
        'REMOTE_ORIGIN_NOT_ALLOWED',
        `Remote origin "${parsedUrl.origin}" is not allowed.`,
        parsedUrl.href,
      );
    }

    return parsedUrl.href;
  }

  private async fetchUncached(url: string, integrity?: IntegrityDigest[]): Promise<string> {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(
          new RemoteModuleError(
            'REMOTE_FETCH_TIMEOUT',
            `Remote module fetch exceeded ${this.timeoutMs}ms.`,
            url,
          ),
        );
      }, this.timeoutMs);
    });

    try {
      const response = await Promise.race([
        this.fetchImpl(url, { signal: controller.signal }),
        timeout,
      ]);

      if (!response.ok) {
        throw new RemoteModuleError(
          'REMOTE_HTTP_ERROR',
          `Remote module responded with HTTP ${response.status}.`,
          url,
          { status: response.status },
        );
      }

      const body = await Promise.race([this.readResponse(response, url), timeout]);
      if (integrity) {
        verifyIntegrity(body, integrity, url);
      }
      return new TextDecoder().decode(body);
    } catch (error) {
      if (error instanceof RemoteModuleError) {
        throw error;
      }

      throw new RemoteModuleError('REMOTE_FETCH_FAILED', 'Failed to fetch remote module.', url, {
        cause: error,
      });
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  private async readResponse(response: Response, url: string): Promise<Uint8Array> {
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > this.maxResponseBytes) {
      throw this.createSizeError(url);
    }

    if (!response.body) {
      const body = new Uint8Array(await response.arrayBuffer());
      if (body.byteLength > this.maxResponseBytes) {
        throw this.createSizeError(url);
      }
      return body;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        totalBytes += value.byteLength;
        if (totalBytes > this.maxResponseBytes) {
          await reader.cancel();
          throw this.createSizeError(url);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return body;
  }

  private createSizeError(url: string): RemoteModuleError {
    return new RemoteModuleError(
      'REMOTE_RESPONSE_TOO_LARGE',
      `Remote module response exceeds ${this.maxResponseBytes} bytes.`,
      url,
    );
  }
}

function parseIntegrity(value: string, url: string): IntegrityDigest[] {
  const digests: IntegrityDigest[] = [];
  for (const token of value.trim().split(/\s+/)) {
    const expression = token.split('?')[0];
    const separator = expression.indexOf('-');
    const algorithmName = (
      separator < 0 ? expression : expression.slice(0, separator)
    ).toLowerCase();
    if (!Object.hasOwn(INTEGRITY_ALGORITHMS, algorithmName)) {
      continue;
    }

    const algorithm = algorithmName as IntegrityAlgorithm;
    const encodedDigest = separator < 0 ? '' : expression.slice(separator + 1);
    const unpaddedDigest = encodedDigest.replace(/=+$/, '');
    const normalizedDigest = unpaddedDigest.replace(/-/g, '+').replace(/_/g, '/');
    const paddingLength = encodedDigest.length - unpaddedDigest.length;
    const expectedPaddingLength = (3 - (INTEGRITY_ALGORITHMS[algorithm] % 3)) % 3;
    const digest = Buffer.from(encodedDigest, 'base64');
    if (
      digest.byteLength !== INTEGRITY_ALGORITHMS[algorithm] ||
      digest.toString('base64').replace(/=+$/, '') !== normalizedDigest ||
      !/^[A-Za-z0-9+/_-]+={0,2}$/.test(encodedDigest) ||
      (paddingLength !== 0 && paddingLength !== expectedPaddingLength)
    ) {
      throw new RemoteModuleError(
        'INVALID_REMOTE_INTEGRITY',
        'Remote module integrity contains a malformed supported digest.',
        url,
      );
    }
    digests.push({ algorithm, digest });
  }

  if (digests.length === 0) {
    throw new RemoteModuleError(
      'INVALID_REMOTE_INTEGRITY',
      'Remote module integrity must contain a valid sha256, sha384, or sha512 digest.',
      url,
    );
  }

  const strongest = digests.reduce((current, entry) => {
    return INTEGRITY_ALGORITHMS[entry.algorithm] > INTEGRITY_ALGORITHMS[current]
      ? entry.algorithm
      : current;
  }, digests[0].algorithm);
  return digests.filter(({ algorithm }) => algorithm === strongest);
}

function verifyIntegrity(body: Uint8Array, digests: IntegrityDigest[], url: string): void {
  const verified = digests.some(({ algorithm, digest }) => {
    const actual = createHash(algorithm).update(body).digest();
    return timingSafeEqual(actual, digest);
  });
  if (!verified) {
    throw new RemoteModuleError(
      'REMOTE_INTEGRITY_MISMATCH',
      'Remote module integrity verification failed.',
      url,
    );
  }
}
