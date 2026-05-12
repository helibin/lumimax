import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '@lumimax/logger';
import { ExternalServiceError, isExternalServiceError } from './provider-error';

@Injectable()
export class DietProviderHttpClient {
  constructor(@Inject(AppLogger) private readonly logger: AppLogger) {}

  async getBinary(input: {
    url: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
    requestId?: string;
  }): Promise<{ contentType: string; base64: string }> {
    const context = createRequestContext({
      method: 'GET',
      url: input.url,
      timeoutMs: input.timeoutMs,
      headers: input.headers,
      requestId: input.requestId,
    });

    try {
      this.writeStartLog(context);
      const response = await this.fetchWithTimeout(context, undefined, '*/*');
      if (!response.ok) {
        throw await buildStatusError({
          method: context.method,
          url: input.url,
          response,
        });
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const result = {
        contentType: response.headers.get('content-type')?.trim() || 'image/jpeg',
        base64: buffer.toString('base64'),
      };

      this.writeSuccessLog(context, response, {
        contentType: result.contentType,
        bytes: buffer.length,
      });
      return result;
    } catch (error) {
      const wrapped = wrapHttpClientError({
        method: context.method,
        url: input.url,
        timeoutMs: context.timeoutMs,
        error,
      });
      this.writeFailureLog(context, wrapped);
      throw wrapped;
    } finally {
      context.dispose();
    }
  }

  async getJson<T>(input: {
    url: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
    requestId?: string;
  }): Promise<T> {
    return this.requestJson<T>({
      method: 'GET',
      url: input.url,
      headers: input.headers,
      timeoutMs: input.timeoutMs,
      requestId: input.requestId,
    });
  }

  async postJson<T>(input: {
    url: string;
    headers?: Record<string, string>;
    body: unknown;
    timeoutMs?: number;
    requestId?: string;
  }): Promise<T> {
    return this.requestJson<T>({
      method: 'POST',
      url: input.url,
      headers: input.headers,
      body: input.body,
      timeoutMs: input.timeoutMs,
      requestId: input.requestId,
    });
  }

  private async requestJson<T>(input: {
    method: 'GET' | 'POST';
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeoutMs?: number;
    requestId?: string;
  }): Promise<T> {
    const context = createRequestContext({
      method: input.method,
      url: input.url,
      timeoutMs: input.timeoutMs,
      headers: input.headers,
      body: input.body,
      requestId: input.requestId,
    });

    try {
      this.writeStartLog(context);
      const response = await this.fetchWithTimeout(
        context,
        input.body !== undefined ? JSON.stringify(input.body) : undefined,
        'application/json',
      );
      const text = await response.text();
      if (!response.ok) {
        throw buildStatusErrorFromText({
          method: context.method,
          url: input.url,
          status: response.status,
          text,
        });
      }

      const payload = text.trim() ? (JSON.parse(text) as T) : ({} as T);
      this.writeSuccessLog(context, response, summarizeStructuredPayload(payload), text);
      return payload;
    } catch (error) {
      const wrapped = wrapHttpClientError({
        method: context.method,
        url: input.url,
        timeoutMs: context.timeoutMs,
        error,
      });
      this.writeFailureLog(context, wrapped);
      throw wrapped;
    } finally {
      context.dispose();
    }
  }

  private async fetchWithTimeout(
    context: ThirdPartyRequestContext,
    body?: string,
    accept = 'application/json',
  ): Promise<Response> {
    return fetch(context.rawUrl, {
      method: context.method,
      headers: {
        Accept: accept,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(context.headers ?? {}),
      },
      body,
      signal: context.controller.signal,
    });
  }

  private writeStartLog(context: ThirdPartyRequestContext): void {
    safeLog(this.logger, 'debug', `发起第三方调用 ${context.method} ${context.sanitizedUrl}`, {
      requestId: context.requestId,
      idLabel: 'ReqId',
      timeoutMs: context.timeoutMs,
      startedAt: new Date(context.startedAt).toISOString(),
      request: context.requestSummary,
    }, DietProviderHttpClient.name);
  }

  private writeSuccessLog(
    context: ThirdPartyRequestContext,
    response: Response,
    result: unknown,
    rawText?: string,
  ): void {
    safeLog(this.logger, 'debug', `<<< 第三方调用完成 ${context.method} ${response.status}`, {
      requestId: context.requestId,
      idLabel: 'ReqId',
      statusCode: response.status,
      ok: response.ok,
      durationMs: Date.now() - context.startedAt,
      finishedAt: new Date().toISOString(),
      response: {
        headers: summarizeResponseHeaders(response.headers),
        ...(rawText !== undefined ? { preview: summarizeResponsePreview(rawText) } : {}),
      },
      result,
    }, DietProviderHttpClient.name);
  }

  private writeFailureLog(
    context: ThirdPartyRequestContext,
    error: Error,
  ): void {
    const external = isExternalServiceError(error) ? error : undefined;
    safeLog(this.logger, 'error', `第三方调用失败 ${context.method} ${context.sanitizedUrl}`, {
      requestId: context.requestId,
      idLabel: 'ReqId',
      timeoutMs: context.timeoutMs,
      startedAt: new Date(context.startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - context.startedAt,
      request: context.requestSummary,
      response: external?.responsePreview,
      result: {
        kind: external?.kind ?? 'unknown',
        statusCode: external?.statusCode ?? null,
        retryable: external?.retryable ?? false,
        userMessage: external?.userMessage ?? error.message,
      },
      errorMessage: error.message,
    }, DietProviderHttpClient.name);
  }
}

type ThirdPartyRequestContext = ReturnType<typeof createRequestContext>;

function createRequestContext(input: {
  method: 'GET' | 'POST';
  url: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  body?: unknown;
  requestId?: string;
}) {
  const controller = new AbortController();
  const timeoutMs = input.timeoutMs ?? 8000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  return {
    method: input.method,
    rawUrl: input.url,
    sanitizedUrl: sanitizeUrl(input.url),
    timeoutMs,
    startedAt,
    requestId: input.requestId,
    controller,
    headers: input.headers,
    requestSummary: buildRequestSummary({
      url: input.url,
      headers: input.headers,
      body: input.body,
    }),
    dispose() {
      clearTimeout(timeout);
    },
  };
}

function safeLog(
  logger: AppLogger,
  level: 'debug' | 'error',
  message: string,
  payload: Record<string, unknown>,
  context: string,
): void {
  const target = logger as unknown as Record<string, unknown>;
  const fn = target[level];
  if (typeof fn === 'function') {
    (fn as (this: unknown, message: string, meta: Record<string, unknown>, context: string) => void).call(
      logger,
      message,
      payload,
      context,
    );
  }
}

function wrapHttpClientError(input: {
  method: 'GET' | 'POST';
  url: string;
  timeoutMs: number;
  error: unknown;
}): Error {
  if (isExternalServiceError(input.error)) {
    return input.error;
  }
  if (isAbortError(input.error)) {
    return new ExternalServiceError({
      kind: 'timeout',
      method: input.method,
      url: sanitizeUrl(input.url),
      retryable: true,
      userMessage: '第三方服务请求超时',
      message: `${input.method} ${sanitizeUrl(input.url)} 请求超时，超时时间 ${input.timeoutMs}ms`,
    });
  }

  const message = input.error instanceof Error ? input.error.message : String(input.error);
  const cause = extractCauseMessage(input.error);
  const kind = classifyTransportErrorKind(`${message} ${cause ?? ''}`.toLowerCase());
  return new ExternalServiceError({
    kind,
    method: input.method,
    url: sanitizeUrl(input.url),
    retryable: kind === 'timeout' || kind === 'network' || kind === 'unavailable',
    userMessage: resolveTransportUserMessage(kind),
    message: `${input.method} ${sanitizeUrl(input.url)} 请求失败: ${message}${cause ? `；原因=${cause}` : ''}`,
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function extractCauseMessage(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = typeof (cause as { code?: unknown }).code === 'string'
      ? (cause as { code?: string }).code
      : undefined;
    return code ? `${code}: ${cause.message}` : cause.message;
  }
  if (typeof cause === 'string' && cause.trim()) {
    return cause.trim();
  }
  return undefined;
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const key of ['key', 'api_key', 'app_key', 'app_id', 'token', 'access_token']) {
      if (url.searchParams.has(key)) {
        url.searchParams.set(key, '[REDACTED]');
      }
    }
    return url.toString();
  } catch {
    return value.replace(
      /([?&](?:key|api_key|app_key|app_id|token|access_token)=)[^&]+/gi,
      '$1[REDACTED]',
    );
  }
}

function sanitizeHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => {
      const lowered = key.toLowerCase();
      if (
        lowered.includes('authorization')
        || lowered.includes('token')
        || lowered.includes('key')
        || lowered.includes('secret')
      ) {
        return [key, '[REDACTED]'];
      }
      return [key, truncateString(value, 120)];
    }),
  );
}

function buildRequestSummary(input: {
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}): Record<string, unknown> {
  return {
    target: summarizeUrlParts(input.url),
    params: summarizeUrlQuery(input.url),
    headers: sanitizeHeaders(input.headers),
    ...(input.body !== undefined ? { body: summarizeRequestPayload(input.body) } : {}),
  };
}

function summarizeUrlParts(value: string): Record<string, unknown> {
  try {
    const url = new URL(value);
    return {
      host: url.host,
      pathname: url.pathname,
    };
  } catch {
    return {
      url: sanitizeUrl(value),
    };
  }
}

function summarizeUrlQuery(value: string): Record<string, unknown> | undefined {
  try {
    const url = new URL(value);
    const entries = [...url.searchParams.entries()].map(([key, rawValue]) => {
      const lowered = key.toLowerCase();
      if (lowered.includes('key') || lowered.includes('token') || lowered.includes('secret')) {
        return [key, '[REDACTED]'];
      }
      return [key, truncateString(rawValue, 120)];
    });
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  } catch {
    return undefined;
  }
}

async function buildStatusError(input: {
  method: 'GET' | 'POST';
  url: string;
  response: Response;
}): Promise<ExternalServiceError> {
  const text = await input.response.text();
  return buildStatusErrorFromText({
    method: input.method,
    url: input.url,
    status: input.response.status,
    text,
  });
}

function buildStatusErrorFromText(input: {
  method: 'GET' | 'POST';
  url: string;
  status: number;
  text: string;
}): ExternalServiceError {
  return new ExternalServiceError({
    kind: classifyStatusKind(input.status),
    method: input.method,
    url: sanitizeUrl(input.url),
    statusCode: input.status,
    retryable: input.status === 429 || input.status >= 500,
    userMessage: resolveStatusUserMessage(input.status),
    message: `${input.method} ${sanitizeUrl(input.url)} ${formatHttpStatusMessage(input.status, input.text)}`,
    responsePreview: summarizeResponsePreview(input.text),
  });
}

function formatHttpStatusMessage(status: number, text: string): string {
  const normalized = normalizeExternalMessage(text);
  return `HTTP ${status}: ${normalized.slice(0, 300)}`;
}

function classifyStatusKind(status: number): ExternalServiceError['kind'] {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'unavailable';
  return 'bad_response';
}

function resolveStatusUserMessage(status: number): string {
  if (status === 401 || status === 403) return '第三方服务鉴权失败';
  if (status === 404) return '第三方资源不存在';
  if (status === 429) return '第三方服务限流';
  if (status >= 500) return '第三方服务暂不可用';
  return '第三方服务返回异常';
}

function classifyTransportErrorKind(message: string): ExternalServiceError['kind'] {
  if (
    message.includes('connect timeout')
    || message.includes('und_err_connect_timeout')
    || message.includes('etimedout')
    || message.includes('esockettimedout')
    || message.includes('deadline exceeded')
    || message.includes('请求超时')
  ) {
    return 'timeout';
  }
  if (
    message.includes('econnrefused')
    || message.includes('econnreset')
    || message.includes('ehostunreach')
    || message.includes('enotfound')
    || message.includes('network')
    || message.includes('fetch failed')
  ) {
    return 'network';
  }
  return 'bad_response';
}

function resolveTransportUserMessage(kind: ExternalServiceError['kind']): string {
  switch (kind) {
    case 'timeout':
      return '第三方服务请求超时';
    case 'network':
    case 'unavailable':
      return '第三方服务连接失败';
    default:
      return '第三方服务返回异常';
  }
}

function normalizeExternalMessage(text: string): string {
  const compact = String(text ?? '').trim();
  if (!compact) {
    return '';
  }
  if (compact.includes('This app_id is for another API.')) {
    return compact.replace('This app_id is for another API.', '当前 app_id 不属于 Nutrition Data API，请检查 Edamam 应用类型');
  }
  if (compact.includes('The specified key does not exist.')) {
    return compact.replace('The specified key does not exist.', '指定的对象不存在');
  }
  if (compact.includes('<Code>NoSuchKey</Code>')) {
    return compact.replace(/<Message>The specified key does not exist\.<\/Message>/g, '<Message>指定的对象不存在</Message>');
  }
  return compact;
}

function summarizeRequestPayload(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return {
      type: 'array',
      length: payload.length,
    };
  }
  if (!payload || typeof payload !== 'object') {
    return typeof payload === 'string' ? truncateString(payload, 180) : payload;
  }
  return Object.fromEntries(
    Object.entries(payload as Record<string, unknown>).slice(0, 8).map(([key, value]) => [
      key,
      summarizeRequestValue(value, key),
    ]),
  );
}

function summarizeRequestValue(value: unknown, key = ''): unknown {
  const lowered = key.toLowerCase();
  if (
    lowered.includes('authorization')
    || lowered.includes('token')
    || lowered.includes('secret')
    || lowered.includes('key')
    || lowered.includes('image')
    || lowered.includes('base64')
  ) {
    if (typeof value === 'string') {
      return value.length > 0 ? `[REDACTED:${value.length}]` : value;
    }
    return '[REDACTED]';
  }
  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length,
    };
  }
  if (!value || typeof value !== 'object') {
    return typeof value === 'string' ? truncateString(value, 180) : value;
  }
  return {
    type: 'object',
    keys: Object.keys(value as Record<string, unknown>).slice(0, 6),
  };
}

function summarizeResponseHeaders(headers: Headers): Record<string, unknown> {
  const picked = ['content-type', 'content-length', 'x-request-id', 'x-ratelimit-remaining'];
  return Object.fromEntries(
    picked
      .map((key) => [key, headers.get(key)])
      .filter(([, value]) => typeof value === 'string' && value.trim().length > 0),
  );
}

function summarizeResponsePreview(text: string): unknown {
  const normalized = normalizeExternalMessage(text);
  if (!normalized) {
    return undefined;
  }
  try {
    return summarizeStructuredPayload(JSON.parse(normalized));
  } catch {
    return truncateString(normalized, 180);
  }
}

function summarizeStructuredPayload(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return {
      type: 'array',
      length: payload.length,
    };
  }
  if (!payload || typeof payload !== 'object') {
    return typeof payload === 'string' ? truncateString(payload, 180) : payload;
  }
  const keys = Object.keys(payload as Record<string, unknown>);
  return {
    type: 'object',
    keys: keys.slice(0, 8),
    size: keys.length,
  };
}

function truncateString(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
