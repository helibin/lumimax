import type { NestMiddleware } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { readLoggerRuntimeConfig } from './logger.config';
import { LoggerService } from './logger.service';
import { RequestContextService } from './request-context.service';
import { redactSensitive } from './logger.redactor';
import { ulid } from 'ulid';

const REQUEST_ID_HEADER = 'x-request-id';

interface HttpLikeRequest {
  method?: string;
  originalUrl?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: unknown;
  body?: unknown;
  ip?: string;
  socket?: { remoteAddress?: string };
  requestId?: string;
  id?: string;
  user?: { userId?: string; tenantId?: string };
}

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly runtime = readLoggerRuntimeConfig();

  constructor(
    @Inject(LoggerService) private readonly logger: LoggerService,
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
  ) {}

  use(req: HttpLikeRequest, res: { setHeader?(name: string, value: string): void }, next: () => void): void {
    const requestId = this.resolveRequestId(req);
    const traceId = requestId;
    const startTime = Date.now();
    const ip = resolveIp(req);
    const headers = req.headers ?? {};
    const clientId = resolveClientId(headers.cookie, ip);
    const userId = typeof req.user?.userId === 'string' ? req.user.userId : undefined;
    const tenantId = typeof req.user?.tenantId === 'string' ? req.user.tenantId : undefined;

    req.id = requestId;
    req.requestId = requestId;
    if (typeof res.setHeader === 'function') {
      res.setHeader(REQUEST_ID_HEADER, requestId);
    }

    this.requestContext.run(
      {
        requestId,
        traceId,
        startTime,
        clientId,
        userId,
        tenantId,
      },
      () => {
        if (!this.shouldSuppress(req.originalUrl ?? req.url)) {
          this.logger.info(
            '收到客户端请求',
            {
              idLabel: 'ReqId',
              ...buildRequestMeta(req, ip, clientId, this.runtime.bodyEnabled, this.runtime.bodyMaxLength),
            },
            RequestLoggingMiddleware.name,
          );

          if (this.runtime.headerEnabled) {
            this.logger.debug(
              'Header',
              {
                idLabel: 'TraceId',
                headers: redactSensitive(normalizeHeaders(headers)),
              },
              RequestLoggingMiddleware.name,
            );
          }
        }
        next();
      },
    );
  }

  private resolveRequestId(req: HttpLikeRequest): string {
    const headerValue = readRequestIdFromHeaders(req.headers);
    if (headerValue) {
      return headerValue;
    }
    if (typeof req.requestId === 'string' && req.requestId.trim().length > 0) {
      return req.requestId.trim();
    }
    if (typeof req.id === 'string' && req.id.trim().length > 0) {
      return req.id.trim();
    }
    return ulid().toLowerCase();
  }

  private shouldSuppress(url?: string): boolean {
    if (!this.runtime.suppressHealthcheck || !url) {
      return false;
    }
    return url === '/health' || url.startsWith('/health?');
  }
}

export { RequestLoggingMiddleware as RequestIdMiddleware };

function buildRequestMeta(
  req: HttpLikeRequest,
  ip: string,
  clientIdStr: string,
  bodyEnabled: boolean,
  maxBodyLength: number,
): Record<string, unknown> {
  const result = parseUserAgent(firstHeader(req.headers?.['user-agent']));
  const method = (req.method ?? 'GET').toUpperCase();
  return {
    method,
    url: req.originalUrl ?? req.url ?? '/',
    host: firstHeader(req.headers?.host),
    ip,
    type: firstHeader(req.headers?.accept) ?? null,
    query: stringifyPayload(req.query ?? {}),
    post: method === 'GET' ? '{}' : bodyEnabled ? stringifyPayload(normalizeRequestBody(req.body, maxBodyLength)) : '{}',
    head: req.headers,
    browser: result.browser.name ?? 'Unknown',
    version: result.browser.version ?? 'Unknown',
    os: result.os.name ?? 'Unknown',
    platform: result.device.vendor && result.device.model
      ? `${result.device.vendor} ${result.device.model}`
      : result.os.name ?? 'Unknown',
    client: result.device.type ?? 'desktop',
    clientIdStr,
    ua: firstHeader(req.headers?.['user-agent']) ?? null,
    referer: firstHeader(req.headers?.referer) ?? null,
  };
}

function normalizeRequestBody(body: unknown, maxLength: number): unknown {
  if (body === null || body === undefined) {
    return {};
  }
  if (Buffer.isBuffer(body)) {
    return `[BinaryBody(${body.length})]`;
  }
  const serialized = stringifyPayload(body);
  if (serialized.length <= maxLength) {
    return body;
  }
  return `${serialized.slice(0, maxLength)}...(truncated ${serialized.length - maxLength} chars)`;
}

function stringifyPayload(input: unknown): string {
  try {
    return JSON.stringify(redactSensitive(input ?? {}));
  } catch {
    return '{}';
  }
}

function normalizeHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      normalized[key] = value.join(', ');
    } else if (typeof value === 'string') {
      normalized[key] = value;
    }
  }
  return normalized;
}

function readRequestIdFromHeaders(
  headers?: Record<string, string | string[] | undefined>,
): string | undefined {
  const candidate = headers?.['x-request-id'] ?? headers?.['X-Request-Id'];
  const raw = Array.isArray(candidate) ? candidate[0] : candidate;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
}

function resolveIp(req: HttpLikeRequest): string {
  const forwarded = firstHeader(req.headers?.['x-forwarded-for']);
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

function resolveClientId(cookieHeader: string | string[] | undefined, ip: string): string {
  const rawCookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
  const clientId = findCookieValue(rawCookie, '_clientId');
  if (!clientId) {
    return `anonymous::${ip}`;
  }
  const segments = clientId.split(':').map((item) => item.trim()).filter(Boolean);
  if (segments.length >= 2) {
    return `${segments[0]}:${segments.slice(1).join(':')}:${ip}`;
  }
  return `desktop::${ip}`;
}

function findCookieValue(cookieHeader: string | undefined, key: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  const cookies = cookieHeader.split(';');
  for (const item of cookies) {
    const [name, value] = item.split('=');
    if (name?.trim() === key && value?.trim()) {
      return decodeURIComponent(value.trim());
    }
  }
  return undefined;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function parseUserAgent(userAgent?: string): {
  browser: { name?: string; version?: string };
  os: { name?: string };
  device: { vendor?: string; model?: string; type?: string };
} {
  const normalized = userAgent?.toLowerCase() ?? '';
  const browserName = normalized.includes('chrome')
    ? 'Chrome'
    : normalized.includes('safari')
      ? 'Safari'
      : normalized.includes('firefox')
        ? 'Firefox'
        : normalized.includes('edge')
          ? 'Edge'
          : undefined;
  const osName = normalized.includes('mac os')
    ? 'macOS'
    : normalized.includes('windows')
      ? 'Windows'
      : normalized.includes('android')
        ? 'Android'
        : normalized.includes('iphone') || normalized.includes('ios')
          ? 'iOS'
          : undefined;
  const deviceType = normalized.includes('mobile')
    ? 'mobile'
    : normalized.includes('tablet')
      ? 'tablet'
      : 'desktop';

  return {
    browser: { name: browserName, version: undefined },
    os: { name: osName },
    device: { type: deviceType },
  };
}
