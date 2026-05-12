import { requestClient } from '#/api/request';

export namespace OtaApi {
  export interface OtaTaskItem {
    checksum: null | string;
    createdAt: string;
    deviceId: string;
    errorCode: null | string;
    errorMessage: null | string;
    firmwareUrl: string;
    firmwareVersion: string;
    id: string;
    progress: number;
    size: null | string;
    status:
      | 'accepted'
      | 'canceled'
      | 'downloading'
      | 'failed'
      | 'installing'
      | 'pending'
      | 'success';
    updatedAt: string;
  }
}

function pickString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function pickObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeOtaStatus(value: unknown): OtaApi.OtaTaskItem['status'] {
  const status = pickString(value) ?? 'pending';
  if (
    status === 'accepted' ||
    status === 'canceled' ||
    status === 'downloading' ||
    status === 'failed' ||
    status === 'installing' ||
    status === 'pending' ||
    status === 'success'
  ) {
    return status;
  }
  if (status === 'sent') {
    return 'accepted';
  }
  return 'pending';
}

function normalizeOtaTaskItem(payload: unknown): OtaApi.OtaTaskItem {
  const item = pickObject(payload);
  const taskPayload = pickObject(item.payload);
  return {
    checksum: pickString(item.checksum) ?? pickString(taskPayload.checksum),
    createdAt:
      pickString(item.createdAt) ?? pickString(item.requestedAt) ?? pickString(item.sentAt) ?? '',
    deviceId: pickString(item.deviceId) ?? '',
    errorCode: pickString(item.errorCode),
    errorMessage: pickString(item.errorMessage) ?? pickString(item.failureReason),
    firmwareUrl: pickString(item.firmwareUrl) ?? pickString(taskPayload.packageUrl) ?? '',
    firmwareVersion:
      pickString(item.firmwareVersion) ?? pickString(taskPayload.targetVersion) ?? '',
    id: pickString(item.id) ?? '',
    progress: typeof item.progress === 'number' ? item.progress : 0,
    size: pickString(item.size),
    status: normalizeOtaStatus(item.status),
    updatedAt:
      pickString(item.updatedAt) ?? pickString(item.sentAt) ?? pickString(item.requestedAt) ?? '',
  };
}

export async function getDeviceOtaTasksApi(deviceId: string) {
  const response = await requestClient.get<unknown[]>(
    `/admin/devices/${encodeURIComponent(deviceId)}/ota/tasks`,
  );
  return Array.isArray(response) ? response.map((item) => normalizeOtaTaskItem(item)) : [];
}

export async function requestDeviceOtaUpgradeApi(
  deviceId: string,
  data: {
    checksum?: string;
    force?: boolean;
    packageSizeBytes?: number;
    packageUrl: string;
    targetVersion: string;
  },
) {
  return requestClient.post(`/admin/devices/${encodeURIComponent(deviceId)}/ota/upgrade`, data);
}

export async function cancelDeviceOtaApi(deviceId: string) {
  return requestClient.post(`/admin/devices/${encodeURIComponent(deviceId)}/ota/cancel`);
}
