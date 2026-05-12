import { DEFAULT_SENSITIVE_KEYS } from './logger.constants';

export function redactSensitive(input: unknown): unknown {
  return redactValue(input, new WeakSet<object>());
}

function redactValue(input: unknown, seen: WeakSet<object>): unknown {
  if (
    input === null
    || input === undefined
    || typeof input === 'string'
    || typeof input === 'number'
    || typeof input === 'boolean'
  ) {
    return input;
  }

  if (typeof input === 'bigint') {
    return input.toString();
  }

  if (input instanceof Date) {
    return input.toISOString();
  }

  if (Buffer.isBuffer(input)) {
    return `[Buffer(${input.length})]`;
  }

  if (input instanceof Error) {
    return {
      name: input.name,
      message: input.message,
      stack: input.stack,
      cause: redactValue((input as Error & { cause?: unknown }).cause, seen),
    };
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactValue(item, seen));
  }

  if (typeof input === 'object') {
    const target = input as Record<string, unknown>;
    if (seen.has(target)) {
      return '[Circular]';
    }
    seen.add(target);
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(target)) {
      output[key] = isSensitiveKey(key)
        ? '[REDACTED]'
        : redactValue(value, seen);
    }
    return output;
  }

  return String(input);
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[_\-\s]/g, '').toLowerCase();
  return DEFAULT_SENSITIVE_KEYS.includes(normalized);
}
