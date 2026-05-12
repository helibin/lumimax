import { requestClient } from '#/api/request';

import { normalizeAdminPaged } from './admin-response';

export namespace AuditApi {
  export interface AuditLogItem {
    action: string;
    after: null | Record<string, unknown>;
    before: null | Record<string, unknown>;
    createdAt: string;
    id: string;
    operatorId: string;
    operatorName: string;
    requestId: null | string;
    resourceId: null | string;
    resourceType: string;
  }
}

interface PagedResult<T> {
  items: T[];
  total: number;
}

function pickNullableObject(value: unknown): null | Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(value: unknown): null | string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeAuditLogItem(payload: unknown): AuditApi.AuditLogItem {
  const item =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  return {
    action: pickString(item.action) ?? '',
    after: pickNullableObject(item.after),
    before: pickNullableObject(item.before),
    createdAt: pickString(item.createdAt) ?? '',
    id: pickString(item.id) ?? '',
    operatorId: pickString(item.operatorId) ?? '',
    operatorName: pickString(item.operatorName) ?? '',
    requestId: pickString(item.requestId),
    resourceId: pickString(item.resourceId),
    resourceType: pickString(item.resourceType) ?? '',
  };
}

export async function getAuditLogListApi(params?: {
  action?: string;
  endAt?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
  resourceType?: string;
  startAt?: string;
}) {
  const response = await requestClient.get<unknown>('/admin/audit-logs', {
    params,
  });
  const paged = normalizeAdminPaged(response);
  return {
    items: paged.items.map((item) => normalizeAuditLogItem(item)),
    total: paged.total,
  } satisfies PagedResult<AuditApi.AuditLogItem>;
}
