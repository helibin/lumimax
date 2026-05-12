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

function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    return {
      type: error.name || 'Error',
      message: error.message || 'Unknown error',
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
