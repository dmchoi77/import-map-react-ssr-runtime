export type ReactStateSerializationErrorCode =
  | 'STATE_NOT_SERIALIZABLE'
  | 'INVALID_STATE_JSON'
  | 'INVALID_ROOT_ID';

export class ReactStateSerializationError extends Error {
  readonly code: ReactStateSerializationErrorCode;

  constructor(code: ReactStateSerializationErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ReactStateSerializationError';
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

export function serializeState(state: unknown): string {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(state);
  } catch (cause) {
    throw new ReactStateSerializationError(
      'STATE_NOT_SERIALIZABLE',
      'State must be JSON serializable.',
      { cause },
    );
  }

  if (serialized === undefined) {
    throw new ReactStateSerializationError(
      'STATE_NOT_SERIALIZABLE',
      'State must be JSON serializable.',
    );
  }

  return escapeHtmlSensitiveCharacters(serialized);
}

export function deserializeState(serialized: string): unknown {
  try {
    return JSON.parse(serialized);
  } catch (cause) {
    throw new ReactStateSerializationError('INVALID_STATE_JSON', 'State is not valid JSON.', {
      cause,
    });
  }
}

export function createStateScript(rootId: string, state: unknown): string {
  if (typeof rootId !== 'string' || rootId.trim().length === 0) {
    throw new ReactStateSerializationError('INVALID_ROOT_ID', 'rootId must be a non-empty string.');
  }

  return `<script type="application/json" data-mfe-state="${escapeHtmlAttribute(rootId)}">${serializeState(state)}</script>`;
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
