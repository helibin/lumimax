/*
 * @Author: Lybeen
 * @Email: helibin@139.com
 * @Date: 2026-04-21 02:28:16
 * @LastEditTime: 2026-04-21 04:17:27
 * @LastEditors: Lybeen
 * @FilePath: /@ai/lumimax/api/libs/common/src/response/response.interceptor.ts
 */
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor} from '@nestjs/common';
import {
  Injectable
} from '@nestjs/common';
import type { Observable} from 'rxjs';
import { map } from 'rxjs';
import {
  BusinessCode,
  localizeErrorMessageByCode,
  resolveLocaleFromRequest,
} from '@lumimax/contracts';
import type { ApiResponseEnvelope } from './api-response.interface';
import {
  createPagedResponse,
  createSuccessResponse,
  extractPagedResult,
  getOrCreateRequestId,
  isApiResponseEnvelope,
} from './response.factory';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType<'http'>() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<any>();
    const res = http.getResponse<any>();
    const requestId = getOrCreateRequestId(req);
    const responseStatus = this.resolveResponseStatus(res);
    const locale = resolveLocaleFromRequest(req);
    const successMessage = localizeErrorMessageByCode(BusinessCode.SUCCESS, locale);

    req.requestId = requestId;
    if (typeof res?.setHeader === 'function') {
      res.setHeader('x-request-id', requestId);
    }

    return next.handle().pipe(
      map((value) => {
        if (isApiResponseEnvelope(value)) {
          return this.normalizeEnvelope(value, requestId, responseStatus);
        }
        const paged = extractPagedResult(value);
        if (paged) {
          return createPagedResponse(
            paged.data,
            paged.pagination,
            requestId,
            successMessage,
            responseStatus,
          );
        }
        const data = value === undefined ? null : value;
        return createSuccessResponse(data, requestId, successMessage, responseStatus);
      }),
    );
  }

  private normalizeEnvelope(
    value: ApiResponseEnvelope<unknown>,
    requestId: string,
    responseStatus: number,
  ): ApiResponseEnvelope<unknown> {
    return {
      ...value,
      status: typeof value.status === 'number' ? value.status : responseStatus,
      timestamp: typeof value.timestamp === 'number' ? value.timestamp : Date.now(),
      requestId: value.requestId || requestId,
    };
  }

  private resolveResponseStatus(res: any): number {
    const value = Number(res?.statusCode);
    if (Number.isFinite(value) && value >= 100 && value <= 599) {
      return value;
    }
    return 200;
  }
}
