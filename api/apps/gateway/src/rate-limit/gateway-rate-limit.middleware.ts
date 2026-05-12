import { Injectable } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import { BusinessCode, localizeErrorMessageByCode, resolveLocaleFromRequest } from '@lumimax/contracts';
import { createErrorResponse, getOrCreateRequestId } from '@lumimax/http-kit';
import { EnvService } from '@lumimax/config';
import { AppLogger } from '@lumimax/logger';
import { GatewayRateLimitService } from './gateway-rate-limit.service';

void GatewayRateLimitService;
void EnvService;
void AppLogger;

const TOO_MANY_REQUESTS_CODE = BusinessCode.REQUEST_TOO_MANY;

@Injectable()
export class GatewayRateLimitMiddleware implements NestMiddleware {
  private readonly rateLimitService: GatewayRateLimitService;
  private readonly envService: EnvService;
  private readonly logger: AppLogger;

  constructor(
    rateLimitService: GatewayRateLimitService,
    envService: EnvService,
    logger: AppLogger,
  ) {
    this.rateLimitService = rateLimitService;
    this.envService = envService;
    this.logger = logger;
  }

  async use(req: any, res: any, next: () => void): Promise<void> {
    const path = this.normalizePath(req?.originalUrl ?? req?.url ?? '/');
    if (this.shouldSkip(path)) {
      next();
      return;
    }

    const identity = this.resolveIdentity(req);
    const scope = this.resolveScope(path);
    const decision = await this.rateLimitService.consume(`${scope}:${identity}`);

    if (typeof res?.setHeader === 'function') {
      res.setHeader('x-ratelimit-limit', String(decision.capacity));
      res.setHeader('x-ratelimit-remaining', String(decision.remainingTokens));
    }

    if (decision.allowed) {
      next();
      return;
    }

    const requestId = getOrCreateRequestId(req);
    req.requestId = requestId;
    req.id = requestId;

    if (typeof res?.setHeader === 'function' && decision.retryAfterMs > 0) {
      res.setHeader(
        'retry-after',
        String(Math.max(1, Math.ceil(decision.retryAfterMs / 1000))),
      );
    }

    this.logger.warn('网关限流触发', {
      requestId,
      identity,
      scope,
      path,
      retryAfterMs: decision.retryAfterMs,
    }, GatewayRateLimitMiddleware.name);

    const locale = resolveLocaleFromRequest(req);
    res
      .status(429)
      .json(
        createErrorResponse(
          TOO_MANY_REQUESTS_CODE,
          localizeErrorMessageByCode(TOO_MANY_REQUESTS_CODE, locale),
          requestId,
          429,
          {
            key: 'request.too_many',
            locale,
            rawMessage: 'Too many requests',
            details: {
              retryAfterMs: decision.retryAfterMs,
            },
          },
        ),
      );
  }

  private shouldSkip(path: string): boolean {
    const { rateLimitSkipPaths } = this.envService.getGatewayConfig();
    return rateLimitSkipPaths.some((item: string) => {
      if (!item) {
        return false;
      }
      return path === item || path.startsWith(`${item}/`);
    });
  }

  private resolveIdentity(req: any): string {
    const user = req?.user;
    const userId = user?.userId ?? user?.id ?? user?.sub;
    if (
      (typeof userId === 'string' || typeof userId === 'number')
      && String(userId).trim().length > 0
    ) {
      return `user:${String(userId)}`;
    }

    const headerUserId = req?.headers?.['x-user-id'];
    if (
      (typeof headerUserId === 'string' || typeof headerUserId === 'number')
      && String(headerUserId).trim().length > 0
    ) {
      return `header-user:${String(headerUserId)}`;
    }

    const xForwardedFor = req?.headers?.['x-forwarded-for'];
    if (typeof xForwardedFor === 'string' && xForwardedFor.trim().length > 0) {
      const first = xForwardedFor
        .split(',')
        .map((item: string) => item.trim())
        .find((item: string) => item.length > 0);
      if (first) {
        return `ip:${first}`;
      }
    }

    const fallbackIp = req?.ip
      ?? req?.socket?.remoteAddress
      ?? req?.connection?.remoteAddress
      ?? 'unknown';
    return `ip:${String(fallbackIp)}`;
  }

  private resolveScope(path: string): string {
    const segments = path.split('/').filter((value) => value.length > 0);
    if (segments.length === 0) {
      return 'root';
    }
    return segments[0]!;
  }

  private normalizePath(path: string): string {
    const [pathname] = path.split('?');
    return pathname || '/';
  }
}
