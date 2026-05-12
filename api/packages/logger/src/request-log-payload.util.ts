const MAX_DEPTH = 5;
const MAX_ARRAY_LENGTH = 20;
const MAX_OBJECT_KEYS = 50;
const MAX_STRING_LENGTH = 500;

const SENSITIVE_KEY_PATTERNS = [
  /pass(word)?/i,
  /token/i,
  /secret/i,
  /authorization/i,
  /cookie/i,
  /api[-_]?key/i,
  /private[-_]?key/i,
  /signature/i,
  /credential/i,
];

export function extractRequestPayloadForLog(req: Record<string, unknown> | undefined): {
  params?: unknown;
  query?: unknown;
  body?: unknown;
} {
  const params = sanitizeRequestSection(req?.params);
  const query = sanitizeRequestSection(req?.query);
  const body = sanitizeRequestSection(req?.body);

  return {
    ...(params === undefined ? {} : { params }),
    ...(query === undefined ? {} : { query }),
    ...(body === undefined ? {} : { body }),
  };
}

function sanitizeRequestSection(value: unknown): unknown | undefined {
  const sanitized = sanitizeValue(value, 0, new WeakSet<object>());
  if (sanitized === undefined || sanitized === null) {
    return undefined;
  }
  if (Array.isArray(sanitized) && sanitized.length === 0) {
    return undefined;
  }
  if (
    typeof sanitized === 'object'
    && sanitized !== null
    && !Array.isArray(sanitized)
    && Object.keys(sanitized as Record<string, unknown>).length === 0
  ) {
    return undefined;
  }
  return sanitized;
}

function sanitizeValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    if (value.length <= MAX_STRING_LENGTH) {
      return value;
    }
    return `${value.slice(0, MAX_STRING_LENGTH)}...(truncated ${value.length - MAX_STRING_LENGTH} chars)`;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return `[Buffer(${value.length})]`;
  }

  if (depth >= MAX_DEPTH) {
    return '[Truncated]';
  }

  if (Array.isArray(value)) {
    const sliced = value.slice(0, MAX_ARRAY_LENGTH);
    const mapped = sliced.map((item) => sanitizeValue(item, depth + 1, seen));
    if (value.length > MAX_ARRAY_LENGTH) {
      mapped.push(`[Truncated ${value.length - MAX_ARRAY_LENGTH} items]`);
    }
    return mapped;
  }

  if (typeof value === 'object') {
    const target = value as Record<string, unknown>;
    if (seen.has(target)) {
      return '[Circular]';
    }
    seen.add(target);

    const entries = Object.entries(target).slice(0, MAX_OBJECT_KEYS);
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of entries) {
      if (isSensitiveKey(key)) {
        output[key] = '[REDACTED]';
      } else {
        output[key] = sanitizeValue(nestedValue, depth + 1, seen);
      }
    }
    if (Object.keys(target).length > MAX_OBJECT_KEYS) {
      output.__truncatedKeys = Object.keys(target).length - MAX_OBJECT_KEYS;
    }
    return output;
  }

  return String(value);
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}
