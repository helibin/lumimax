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
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType<'http' | 'rpc' | 'ws'>() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Record<string, unknown>>();
    const response = http.getResponse<{ statusCode?: number }>();
    const startedAt = this.requestContext.getStartTime() ?? Date.now();

    return next.handle().pipe(
      tap(() => {
        const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(3);
        this.logger.info(
          `响应客户端请求，耗时(s): ${durationSeconds}`,
          {
            idLabel: 'TraceId',
            durationSeconds: Number(durationSeconds),
            statusCode: response?.statusCode ?? 200,
            method: typeof request.method === 'string' ? request.method : '-',
            url: resolveRequestUrl(request),
          },
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
