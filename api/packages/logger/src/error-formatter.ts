import { compactStack } from './stack.util';

export interface FormattedError {
  errorType: string;
  rootCause: string;
  shortMessage: string;
  hint?: string;
  compactStack: string[];
}

interface NormalizedError {
  type: string;
  message: string;
  code?: string;
  stack?: string;
}

export function formatError(
  error: unknown,
  stackMaxLines?: number,
): FormattedError {
  const normalized = normalizeError(error);
  const message = normalized.message.toUpperCase();
  const code = normalized.code?.toUpperCase();
  const compact = compactStack(normalized.stack, { maxLines: stackMaxLines });

  if (normalized.type === 'ReplyError' && message.includes('NOAUTH')) {
    return withBase(
      normalized,
      compact,
      'Redis authentication failed',
      'Check REDIS_URL / REDIS_PASSWORD configuration.',
    );
  }

  if (message.includes('WRONGPASS')) {
    return withBase(
      normalized,
      compact,
      'Redis password invalid',
      'Verify Redis credentials and ACL user/password settings.',
    );
  }

  if (code === 'ECONNREFUSED' || message.includes('ECONNREFUSED')) {
    return withBase(
      normalized,
      compact,
      'Target service refused connection',
      'Check dependency process, host/port, and container network.',
    );
  }

  if (code === 'ETIMEDOUT' || message.includes('ETIMEDOUT') || message.includes('TIMEOUT')) {
    return withBase(
      normalized,
      compact,
      'Dependency request timeout',
      'Check dependency health, network latency, and timeout settings.',
    );
  }

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || message.includes('ENOTFOUND')) {
    return withBase(
      normalized,
      compact,
      'Dependency hostname cannot be resolved',
      'Check DNS/host config for dependency endpoint.',
    );
  }

  if ((error as { isAxiosError?: boolean })?.isAxiosError) {
    return withBase(
      normalized,
      compact,
      'HTTP dependency call failed',
      'Inspect upstream status and request/response payload.',
    );
  }

  if (normalized.type.toLowerCase().includes('timeout')) {
    return withBase(
      normalized,
      compact,
      'Operation timeout',
      'Increase timeout or optimize downstream dependency.',
    );
  }

  if (normalized.type.toLowerCase().includes('grpc') || message.includes('14 UNAVAILABLE')) {
    return withBase(
      normalized,
      compact,
      'gRPC dependency unavailable',
      'Check gRPC server address, service readiness, and network access.',
    );
  }

  if (message.includes('AMQP') || normalized.type.toLowerCase().includes('amqp')) {
    return withBase(
      normalized,
      compact,
      'RabbitMQ connection/channel error',
      'Check RABBITMQ_URL, credentials, queue/exchange declaration, and broker status.',
    );
  }

  return withBase(normalized, compact, normalized.message || 'Unexpected error');
}

function withBase(
  error: NormalizedError,
  compact: string[],
  rootCause: string,
  hint?: string,
): FormattedError {
  return {
    errorType: error.type,
    rootCause,
    shortMessage: error.message,
    hint,
    compactStack: compact,
  };
}

/**
 * 单行日志用：Node 内置 `fetch` 失败时常为 `TypeError: fetch failed`，真实原因在 `cause` 链里。
 */
export function formatErrorMessageForLog(error: Error): string {
  const base = (error.message || 'Unknown error').trim();
  if (base !== 'fetch failed') {
    return base;
  }
  const chain = collectCauseMessages(error.cause, 8);
  if (chain.length === 0) {
    return base;
  }
  return `${base}: ${chain.join(' ← ')}`;
}

function collectCauseMessages(cause: unknown, maxDepth: number): string[] {
  const out: string[] = [];
  let cur: unknown = cause;
  let depth = 0;
  while (cur != null && depth < maxDepth) {
    depth++;
    if (cur instanceof AggregateError) {
      const first = cur.errors[0];
      if (first !== undefined) {
        cur = first;
        continue;
      }
      cur = cur.cause;
      continue;
    }
    if (cur instanceof Error) {
      const e = cur as NodeJS.ErrnoException;
      const code = e.code ? `[${e.code}] ` : '';
      const msg = (e.message || e.name || 'Error').trim();
      out.push(`${code}${msg}`.trim());
      cur = e.cause;
      continue;
    }
    if (typeof cur === 'object' && cur !== null) {
      const o = cur as Record<string, unknown>;
      const code = typeof o.code === 'string' ? `[${o.code}] ` : '';
      const msg =
        typeof o.message === 'string'
          ? o.message.trim()
          : typeof o.digest === 'string'
            ? String(o.digest)
            : '';
      if (msg) {
        out.push(`${code}${msg}`.trim());
      }
      cur = o.cause;
      continue;
    }
    const s = typeof cur === 'string' ? cur : String(cur);
    if (s && s !== '[object Object]') {
      out.push(s);
    }
    break;
  }
  return out;
}

function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    const message =
      error.message === 'fetch failed'
        ? formatErrorMessageForLog(error)
        : (error.message || 'Unknown error');
    return {
      type: error.name || 'Error',
      message,
      code: readCode(error),
      stack: error.stack,
    };
  }

  if (error && typeof error === 'object') {
    const target = error as Record<string, unknown>;
    const type = pickString(target.name) ?? pickString(target.type) ?? 'Error';
    const message = pickString(target.message) ?? 'Unknown error';
    const code = pickString(target.code);
    const stack = pickString(target.stack);
    return { type, message, code, stack };
  }

  if (typeof error === 'string') {
    return { type: 'Error', message: error };
  }

  return { type: 'Error', message: 'Unknown error' };
}

function readCode(error: Error): string | undefined {
  const code = (error as Error & { code?: unknown }).code;
  return typeof code === 'string' || typeof code === 'number'
    ? String(code)
    : undefined;
}

function pickString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}
