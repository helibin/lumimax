import { requestClient } from '#/api/request';

import { normalizeAdminPaged } from './admin-response';

export namespace WeighingApi {
  export interface WeighingRecordItem {
    analysisResult: null | Record<string, unknown>;
    createdAt: string;
    deviceId: string;
    id: string;
    imageObjectId?: string;
    measuredAt: string;
    rawPayload: Record<string, unknown>;
    tenantId: null | string;
    userId: null | string;
    weightUnit: string;
    weightValue: string;
  }
}

interface PagedResult<T> {
  items: T[];
  total: number;
}

function pickString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function pickObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeWeighingRecord(payload: unknown) {
  const item = pickObject(payload);
  const imageObjectId = pickString(item.imageObjectId);
  let imageObjectIds: string[];
  if (Array.isArray(item.imageObjectIds) && item.imageObjectIds.length > 0) {
    imageObjectIds = item.imageObjectIds as string[];
  } else if (imageObjectId) {
    imageObjectIds = [imageObjectId];
  } else {
    imageObjectIds = [];
  }
  return {
    analysisResult:
      Object.keys(pickObject(item.analysisResult)).length > 0
        ? pickObject(item.analysisResult)
        : null,
    createdAt: pickString(item.createdAt) ?? '',
    deviceId: pickString(item.deviceId) ?? '',
    id: pickString(item.id) ?? '',
    imageObjectId: imageObjectId ?? undefined,
    imageObjectIds,
    measuredAt: pickString(item.measuredAt) ?? pickString(item.createdAt) ?? '',
    rawPayload: pickObject(item.rawPayload),
    tenantId: pickString(item.tenantId),
    userId: pickString(item.userId),
    weightUnit: pickString(item.weightUnit) ?? '',
    weightValue: pickString(item.weightValue) ?? '',
  };
}

export async function getWeighingRecordListApi(params?: { page?: number; pageSize?: number }) {
  const response = await requestClient.get<PagedResult<unknown>>('/admin/weighing-records', {
    params,
  });
  const result = normalizeAdminPaged<unknown>(response);
  return {
    items: result.items.map((item) => normalizeWeighingRecord(item)),
    total: result.total,
  } satisfies PagedResult<WeighingApi.WeighingRecordItem>;
}

export async function getWeighingRecordDetailApi(id: string) {
  const response = await requestClient.get<unknown>(`/admin/weighing-records/${id}`);
  return normalizeWeighingRecord(response) as WeighingApi.WeighingRecordItem;
}
