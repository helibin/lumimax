/*
 * @Author: Lybeen
 * @Email: helibin@139.com
 * @Date: 2026-05-02 04:50:53
 * @LastEditTime: 2026-05-14 14:17:41
 * @LastEditors: Lybeen
 * @FilePath: /@ai/lumimax/api/packages/logger/src/response-logging.interceptor.ts
 */
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs';
import { LoggerService } from './logger.service';
import { RequestContextService } from './request-context.service';

@Injectable()
export class ResponseLoggingInterceptor implements NestInterceptor {
  constructor(
    @Inject(LoggerService) private readonly logger: LoggerService,
    @Inject(RequestContextService)
    private readonly requestContext: RequestContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType<'http' | 'rpc' | 'ws'>() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Record<string, unknown>>();
    const response = http.getResponse<{
      statusCode?: number;
      setHeader?(name: string, value: number | string): void;
    }>();
    const startedAt = this.requestContext.getStartTime() ?? Date.now();

    return next.handle().pipe(
      tap((value) => {
        const durationMilliseconds = Date.now() - startedAt;
        if (typeof response?.setHeader === 'function') {
          response.setHeader(
            'x-response-time-ms',
            String(durationMilliseconds),
          );
        }
        this.logger.info(
          '响应客户端请求',
          value === undefined ? undefined : { ...value },
          ResponseLoggingInterceptor.name,
        );
      }),
    );
  }
}

function resolveRequestUrl(request: Record<string, unknown>): string {
  const originalUrl = request.originalUrl;
  if (typeof originalUrl === 'string' && originalUrl.trim().length > 0) {
    return originalUrl;
  }
  const url = request.url;
  return typeof url === 'string' && url.trim().length > 0 ? url : '/';
}
