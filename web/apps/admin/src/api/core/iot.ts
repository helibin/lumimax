import { requestClient } from '#/api/request';

import { normalizeAdminPaged } from './admin-response';

export namespace IotApi {
  export type MessageDirection = 'downstream' | 'upstream';
  export type MessageStatus = 'failed' | 'handled' | 'received' | 'skipped';

  export interface IotMessageItem {
    createdAt: string;
    deviceId: string;
    direction: MessageDirection | string;
    event: string;
    id: string;
    requestId: string;
    status: MessageStatus | string;
    topic: string;
  }

  export interface IotMessageDetail extends IotMessageItem {
    error: unknown;
    payload: unknown;
    response: unknown;
  }

  export interface RecognitionLogItem {
    createdAt: string;
    deviceId: string;
    id: string;
    imageKey: string;
    latencyMs: null | number;
    mealId: string;
    provider: string;
    requestId: string;
    status: string;
  }

  export interface RecognitionLogDetail extends RecognitionLogItem {
    error: unknown;
    requestPayload: unknown;
    responsePayload: unknown;
  }
}

interface PagedResult<T> {
  items: T[];
  total: number;
}

function pickObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeJsonValue(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }
  return value;
}

function pickString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function pickNumber(value: unknown): null | number {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeIotMessageItem(payload: unknown): IotApi.IotMessageItem {
  const item = pickObject(payload);
  return {
    createdAt: pickString(item.createdAt),
    deviceId: pickString(item.deviceId),
    direction: pickString(item.direction),
    event: pickString(item.event),
    id: pickString(item.id),
    requestId: pickString(item.requestId),
    status: pickString(item.status),
    topic: pickString(item.topic),
  };
}

function normalizeIotMessageDetail(payload: unknown): IotApi.IotMessageDetail {
  const item = pickObject(payload);
  return {
    ...normalizeIotMessageItem(item),
    error: normalizeJsonValue(item.error),
    payload: normalizeJsonValue(item.payload),
    response: normalizeJsonValue(item.response),
  };
}

function normalizeRecognitionLogItem(payload: unknown): IotApi.RecognitionLogItem {
  const item = pickObject(payload);
  return {
    createdAt: pickString(item.createdAt),
    deviceId: pickString(item.deviceId),
    id: pickString(item.id),
    imageKey: pickString(item.imageKey),
    latencyMs: pickNumber(item.latencyMs),
    mealId: pickString(item.mealId),
    provider: pickString(item.provider),
    requestId: pickString(item.requestId),
    status: pickString(item.status),
  };
}

function normalizeRecognitionLogDetail(payload: unknown): IotApi.RecognitionLogDetail {
  const item = pickObject(payload);
  return {
    ...normalizeRecognitionLogItem(item),
    error: normalizeJsonValue(item.error),
    requestPayload: normalizeJsonValue(item.requestPayload),
    responsePayload: normalizeJsonValue(item.responsePayload),
  };
}

export async function getIotMessageListApi(params?: {
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  const response = await requestClient.get<unknown>('/admin/iot/messages', {
    params,
  });
  const paged = normalizeAdminPaged(response);
  return {
    items: paged.items.map((item) => normalizeIotMessageItem(item)),
    total: paged.total,
  } satisfies PagedResult<IotApi.IotMessageItem>;
}

export async function getIotMessageDetailApi(id: string) {
  const response = await requestClient.get<unknown>(
    `/admin/iot/messages/${encodeURIComponent(id)}`,
  );
  const target = pickObject(response);

  if ('id' in target || 'requestId' in target || 'topic' in target) {
    return normalizeIotMessageDetail(target);
  }

  const json = pickString(target.json);
  if (json) {
    try {
      return normalizeIotMessageDetail(JSON.parse(json) as unknown);
    } catch {
      return normalizeIotMessageDetail({});
    }
  }

  return normalizeIotMessageDetail({});
}

export async function getRecognitionLogListApi(params?: { page?: number; pageSize?: number }) {
  const response = await requestClient.get<unknown>('/admin/recognition-logs', {
    params,
  });
  const paged = normalizeAdminPaged(response);
  return {
    items: paged.items.map((item) => normalizeRecognitionLogItem(item)),
    total: paged.total,
  } satisfies PagedResult<IotApi.RecognitionLogItem>;
}

export async function getRecognitionLogDetailApi(id: string) {
  const response = await requestClient.get<unknown>(
    `/admin/recognition-logs/${encodeURIComponent(id)}`,
  );
  return normalizeRecognitionLogDetail(response);
}
