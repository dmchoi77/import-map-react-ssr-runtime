import type { ReactHydrationContract } from './types';

export type ReactHydrationSerializationErrorCode =
  | 'HYDRATION_DATA_NOT_SERIALIZABLE'
  | 'INVALID_HYDRATION_DATA'
  | 'INVALID_ROOT_ID';

export class ReactHydrationSerializationError extends Error {
  readonly code: ReactHydrationSerializationErrorCode;

  constructor(code: ReactHydrationSerializationErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ReactHydrationSerializationError';
    this.code = code;
  }
}

const JSON_HTML_ESCAPE_SEQUENCES: Record<string, string> = {
  '&': '\\u0026',
  '<': '\\u003C',
  '>': '\\u003E',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

const HTML_ATTRIBUTE_ESCAPE_SEQUENCES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function serializeHydrationData(value: unknown): string {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch (cause) {
    throw new ReactHydrationSerializationError(
      'HYDRATION_DATA_NOT_SERIALIZABLE',
      'Hydration data must be JSON serializable.',
      { cause },
    );
  }

  if (serialized === undefined) {
    throw new ReactHydrationSerializationError(
      'HYDRATION_DATA_NOT_SERIALIZABLE',
      'Hydration data must be JSON serializable.',
    );
  }

  return escapeHtmlSensitiveCharacters(serialized);
}

export function deserializeHydrationData(serialized: string): unknown {
  try {
    return JSON.parse(serialized);
  } catch (cause) {
    throw new ReactHydrationSerializationError(
      'INVALID_HYDRATION_DATA',
      'Hydration data is not valid JSON.',
      { cause },
    );
  }
}

export function createHydrationScript<Props extends object>(
  rootId: string,
  contract: ReactHydrationContract<Props>,
): string {
  if (typeof rootId !== 'string' || rootId.trim().length === 0) {
    throw new ReactHydrationSerializationError(
      'INVALID_ROOT_ID',
      'rootId must be a non-empty string.',
    );
  }

  return `<script type="application/json" data-mfe-react-hydration="${escapeHtmlAttribute(rootId)}">${serializeHydrationData(contract)}</script>`;
}

function escapeHtmlSensitiveCharacters(value: string): string {
  return value.replace(/[&<>\u2028\u2029]/g, (character) => {
    return JSON_HTML_ESCAPE_SEQUENCES[character];
  });
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    return HTML_ATTRIBUTE_ESCAPE_SEQUENCES[character];
  });
}
