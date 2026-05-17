import { requestClient } from '#/api/request';

export namespace DebugApi {
  export interface UploadCredential {
    allowedMimeTypes?: string[];
    bucket?: string;
    expiresAt?: string;
    headers?: Record<string, string>;
    maxFileSize?: number;
    method?: string;
    objectKey: string;
    provider?: string;
    region?: string;
    requestId?: string;
    uploadMode?: string;
    uploadUrl?: string;
  }

  export interface UploadTokenParams {
    allowedMimeTypes?: string[];
    deviceId?: string;
    filename: string;
    maxFileSize?: number;
    mode?: 'credentials' | 'presigned-url';
    ownerType?: 'device' | 'user';
    userId: string;
  }

  export interface ConfirmUploadParams {
    bucket?: string;
    objectKey: string;
    provider?: string;
    region?: string;
    userId: string;
  }

  export interface CreateMealParams {
    deviceId?: string;
    locale?: string;
    market?: string;
    userId: string;
  }

  export interface AnalyzeMealParams {
    deviceId?: string;
    imageKey: string;
    locale?: string;
    market?: string;
    userId: string;
    weightGram: number;
  }

  export interface IngestIotParams {
    payload?: Record<string, unknown>;
    topic?: string;
    vendor?: string;
    webhook?: Record<string, unknown>;
  }

  export interface DeviceProtocolUploadUrlParams {
    deviceId: string;
    fileType?: string;
    filename?: string;
    locale?: string;
    market?: string;
    userId?: string;
  }

  export interface DeviceProtocolFoodRecognitionParams {
    deviceId: string;
    imageKey: string;
    objectKey?: string;
    weightGram: number;
    locale?: string;
    market?: string;
    userId?: string;
  }

  export interface DeviceProtocolUploadUrlResult {
    event: string;
    upload: {
      bucket: null | string;
      expiresAt: unknown;
      headers: Record<string, string>;
      maxFileSize: null | number;
      method: string;
      objectKey: string;
      provider: null | string;
      region: null | string;
      uploadUrl: null | string;
    };
  }

  export interface DeviceProtocolFoodRecognitionResult {
    deviceSn: string;
    downlink: Record<string, unknown> | null;
    internalDeviceId: string;
    mealRecordId: string;
    objectKey: string;
    requiresUserConfirmation: boolean | null;
    steps: Array<Record<string, unknown>>;
    weightGram: number;
  }
}

function pickString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function pickObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeUploadCredential(value: unknown): DebugApi.UploadCredential {
  const record = pickObject(value) ?? {};
  return {
    allowedMimeTypes: Array.isArray(record.allowedMimeTypes)
      ? record.allowedMimeTypes.filter((item): item is string => typeof item === 'string')
      : undefined,
    bucket: pickString(record.bucket) ?? undefined,
    expiresAt: pickString(record.expiresAt) ?? undefined,
    headers: pickObject(record.headers) as Record<string, string> | undefined,
    maxFileSize: typeof record.maxFileSize === 'number' ? record.maxFileSize : undefined,
    method: pickString(record.method) ?? undefined,
    objectKey: pickString(record.objectKey) ?? '',
    provider: pickString(record.provider) ?? undefined,
    region: pickString(record.region) ?? undefined,
    requestId: pickString(record.requestId) ?? undefined,
    uploadMode: pickString(record.uploadMode) ?? undefined,
    uploadUrl: pickString(record.uploadUrl) ?? undefined,
  };
}

export async function createDebugUploadTokenApi(params: DebugApi.UploadTokenParams) {
  const response = await requestClient.post<unknown>('/admin/debug/storage/upload-token', params);
  return normalizeUploadCredential(response);
}

export async function confirmDebugUploadApi(params: DebugApi.ConfirmUploadParams) {
  const response = await requestClient.post<unknown>('/admin/debug/storage/confirm', params);
  return pickObject(response) ?? {};
}

export async function createDebugMealApi(params: DebugApi.CreateMealParams) {
  const response = await requestClient.post<unknown>('/admin/debug/meals', params);
  return pickObject(response) ?? {};
}

export async function analyzeDebugMealApi(mealRecordId: string, params: DebugApi.AnalyzeMealParams) {
  const response = await requestClient.post<unknown>(
    `/admin/debug/meals/${encodeURIComponent(mealRecordId)}/analyze`,
    params,
  );
  return pickObject(response) ?? {};
}

export async function finishDebugMealApi(
  mealRecordId: string,
  params: Pick<DebugApi.CreateMealParams, 'userId'>,
) {
  const response = await requestClient.post<unknown>(
    `/admin/debug/meals/${encodeURIComponent(mealRecordId)}/finish`,
    params,
  );
  return pickObject(response) ?? {};
}

export async function ingestDebugIotMessageApi(params: DebugApi.IngestIotParams) {
  const response = await requestClient.post<unknown>('/admin/debug/iot/ingest', params);
  return pickObject(response) ?? {};
}

function normalizeDeviceProtocolUpload(
  value: unknown,
): DebugApi.DeviceProtocolUploadUrlResult {
  const record = pickObject(value) ?? {};
  const upload = pickObject(record.upload) ?? {};
  const headers = pickObject(upload.headers) ?? {};
  return {
    event: pickString(record.event) ?? 'upload.url.request',
    upload: {
      objectKey: pickString(upload.objectKey) ?? '',
      uploadUrl: pickString(upload.uploadUrl),
      method: pickString(upload.method) ?? 'PUT',
      headers: Object.fromEntries(
        Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      ),
      expiresAt: upload.expiresAt ?? null,
      maxFileSize: typeof upload.maxFileSize === 'number' ? upload.maxFileSize : null,
      provider: pickString(upload.provider),
      bucket: pickString(upload.bucket),
      region: pickString(upload.region),
    },
  };
}

function normalizeDeviceProtocolFoodRecognition(
  value: unknown,
): DebugApi.DeviceProtocolFoodRecognitionResult {
  const record = pickObject(value) ?? {};
  return {
    deviceSn: pickString(record.deviceSn) ?? '',
    internalDeviceId: pickString(record.internalDeviceId) ?? '',
    mealRecordId: pickString(record.mealRecordId) ?? '',
    objectKey: pickString(record.objectKey) ?? '',
    weightGram: typeof record.weightGram === 'number' ? record.weightGram : 0,
    steps: Array.isArray(record.steps)
      ? record.steps.filter((item): item is Record<string, unknown> => !!pickObject(item))
      : [],
    downlink: pickObject(record.downlink),
    requiresUserConfirmation:
      typeof record.requiresUserConfirmation === 'boolean' ? record.requiresUserConfirmation : null,
  };
}

export async function requestDeviceProtocolUploadUrlApi(
  params: DebugApi.DeviceProtocolUploadUrlParams,
) {
  const response = await requestClient.post<unknown>(
    '/admin/debug/device-protocol/upload-url',
    params,
  );
  return normalizeDeviceProtocolUpload(response);
}

export async function runDeviceProtocolFoodRecognitionApi(
  params: DebugApi.DeviceProtocolFoodRecognitionParams,
) {
  const response = await requestClient.post<unknown>(
    '/admin/debug/device-protocol/food-recognition',
    {
      ...params,
      objectKey: params.objectKey ?? params.imageKey,
    },
  );
  return normalizeDeviceProtocolFoodRecognition(response);
}
