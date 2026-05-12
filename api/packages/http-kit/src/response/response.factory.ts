/*
 * @Author: Lybeen
 * @Email: helibin@139.com
 * @Date: 2026-04-21 02:28:03
 * @LastEditTime: 2026-04-25 10:38:50
 * @LastEditors: Lybeen
 * @FilePath: /@ai/lumimax/api/libs/common/src/response/response.factory.ts
 */
import type {
  ApiResponseEnvelope,
  PaginationMeta,
  PagedResult,
} from './api-response.interface';
import { getEnvString } from '@lumimax/config';
import {
  generateRequestId,
  readRequestIdFromHeaders,
} from '@lumimax/runtime';

export function getOrCreateRequestId(
  req?: { id?: string; requestId?: string; headers?: Record<string, unknown> },
): string {
  const headerRequestId = readRequestIdFromHeaders(req?.headers);
  const raw = req?.requestId ?? req?.id ?? headerRequestId;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw;
  }
  return generateRequestId();
}

export function isApiResponseEnvelope(value: unknown): value is ApiResponseEnvelope<unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const target = value as Record<string, unknown>;
  return (
    typeof target.code === 'number' &&
    (target.status === undefined || typeof target.status === 'number') &&
    typeof target.msg === 'string' &&
    'data' in target &&
    typeof target.timestamp === 'number' &&
    typeof target.requestId === 'string'
  );
}

export function isPagedResult(value: unknown): value is PagedResult<unknown> {
  return extractPagedResult(value) !== null;
}

export function extractPagedResult(
  value: unknown,
): null | PagedResult<unknown> {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const target = value as Record<string, unknown>;
  const data = Array.isArray(target.data)
    ? target.data
    : Array.isArray(target.items)
      ? target.items
      : null;
  if (!data) {
    return null;
  }

  const pagination = target.pagination;
  if (!pagination || typeof pagination !== 'object') {
    return null;
  }

  const meta = pagination as Record<string, unknown>;
  const page = Number(meta.page);
  const pageSize = Number(meta.pageSize ?? meta.page_size);
  const total = Number(meta.total);
  const totalPages = Number(meta.totalPages ?? meta.total_pages);
  const hasMoreRaw = meta.hasMore ?? meta.has_more;
  if (
    !Number.isFinite(page)
    || !Number.isFinite(pageSize)
    || !Number.isFinite(total)
    || !Number.isFinite(totalPages)
    || typeof hasMoreRaw !== 'boolean'
  ) {
    return null;
  }
  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasMore: hasMoreRaw,
    },
  };
}

export function createSuccessResponse<T>(
  data: T,
  requestId: string,
  msg = 'ok',
  status = 200,
): ApiResponseEnvelope<T> {
  return {
    code: 0,
    status,
    msg,
    data,
    timestamp: Date.now(),
    requestId,
  };
}

interface CreateErrorResponseOptions {
  details?: unknown;
  key?: string;
  locale?: string;
  rawMessage?: string;
}

export function createErrorResponse(
  code: number,
  msg: string,
  requestId: string,
  statusOrOptions?: number | CreateErrorResponseOptions,
  _options?: CreateErrorResponseOptions,
): ApiResponseEnvelope<null> {
  const status = typeof statusOrOptions === 'number' ? statusOrOptions : 500;
  const options =
    typeof statusOrOptions === 'number' ? _options : statusOrOptions;

  return {
    code,
    status,
    msg,
    data: null,
    timestamp: Date.now(),
    requestId,
    ...(options
      ? {
        error: {
          ...(options.key ? { key: options.key } : {}),
          ...(options.locale ? { locale: options.locale } : {}),
          ...((getEnvString('NODE_ENV', 'development') ?? 'development') !== 'production'
            ? { rawMessage: options.rawMessage }
            : {}),
          ...(options.details === undefined ? {} : { details: options.details }),
        },
      }
      : {}),
  };
}

export function createPagedResponse<T>(
  data: T[],
  pagination: PaginationMeta,
  requestId: string,
  msg = 'ok',
  status = 200,
): ApiResponseEnvelope<T[]> {
  return {
    code: 0,
    status,
    msg,
    data,
    pagination,
    timestamp: Date.now(),
    requestId,
  };
}

export function createPagedResult<T>(
  items: T[],
  page: number,
  pageSize: number,
  total: number,
): PagedResult<T> {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Number(pageSize) || 10);
  const safeTotal = Math.max(0, Number(total) || 0);
  const totalPages = Math.ceil(safeTotal / safePageSize) || 1;

  return {
    data: items,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total: safeTotal,
      totalPages,
      hasMore: safePage < totalPages,
    },
  };
}
