import { requestClient } from '#/api/request';

export namespace DeviceApi {
  export type DeviceProvider = 'aliyun' | 'aws' | 'emqx';
  export type DeviceMarket = 'CN' | 'US';
  export type DeviceStatus = 'disabled' | 'inactive' | 'offline' | 'online';

  export interface DeviceItem {
    activatedAt: null | string;
    deviceName: string;
    deviceType: string;
    firmwareVersion: null | string;
    id: string;
    isActivated: boolean;
    lastSeenAt: null | string;
    locale: null | string;
    market: DeviceMarket | null;
    metadata: Record<string, unknown>;
    name: string;
    ownerUserId: null | string;
    productCode: string;
    productKey: null | string;
    provider: DeviceProvider;
    providerDeviceId: string;
    sn: null | string;
    status: DeviceStatus;
    tenantId: null | string;
    thingName: null | string;
  }

  export interface CreateDeviceParams {
    boundUserId?: string;
    deviceSn: string;
    deviceType?: string;
    name: string;
    onlineStatus?: 'offline' | 'online';
    productKey?: string;
    provider?: DeviceProvider;
    status?: 'active' | 'disabled';
  }

  export interface BindDeviceParams {
    tenantId?: null | string;
    userId?: null | string;
  }

  export interface DeviceCredentialDetail {
    available: boolean;
    certificateArn: null | string;
    certificatePem: null | string;
    claimAvailable: boolean;
    claimedAt: null | string;
    credentialId: null | string;
    credentialType: string;
    deviceId: string;
    endpoint: null | string;
    expiresAt: null | string;
    fingerprint: null | string;
    hasDeviceSecret?: boolean;
    hasPrivateKey: boolean;
    issuedAt: null | string;
    metadata: Record<string, unknown>;
    provider: DeviceProvider;
    productKey?: null | string;
    region: null | string;
    source: string;
    status: string;
    thingName: null | string;
    updatedAt: null | string;
    vendor: string;
  }

  export interface DeviceCommandItem {
    ackedAt: null | string;
    commandType: string;
    deviceId: string;
    failureReason: null | string;
    id: string;
    payload: Record<string, unknown>;
    requestedAt: string;
    requestedBy: string;
    sentAt: null | string;
    status: 'acked' | 'failed' | 'pending' | 'sent' | 'timeout';
  }

  export interface DownloadedDeviceCredentialPackage {
    fileName: string;
    blob: Blob;
    mimeType: string;
  }

  export interface ClaimedDeviceCredentialConfig {
    certificateArn: null | string;
    certificatePem: null | string;
    claimedAt: null | string;
    clientId: null | string;
    clipboardText: string;
    credentialId?: null | string;
    deviceId: string;
    deviceSecret?: null | string;
    deviceSn: string;
    endpoint: null | string;
    privateKeyPem: null | string;
    productKey?: null | string;
    region: null | string;
    rootCaPem: null | string;
    thingName: null | string;
    vendor: null | string;
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

function normalizeDeviceStatus(status: unknown, onlineStatus: unknown): DeviceApi.DeviceStatus {
  if (status === 'disabled') {
    return 'disabled';
  }
  if (onlineStatus === 'online') {
    return 'online';
  }
  if (onlineStatus === 'offline') {
    return 'offline';
  }
  return 'inactive';
}

function normalizeDeviceItem(payload: unknown): DeviceApi.DeviceItem {
  const item = pickObject(payload);
  const metadata = pickObject(item.metadata);
  const id = pickString(item.id) ?? '';
  const deviceSn = pickString(item.deviceSn);
  const productKey = pickString(item.productKey);
  const rawStatus = pickString(item.status);
  const provider =
    pickString(item.provider) === 'aliyun'
      ? 'aliyun'
      : pickString(item.provider) === 'emqx'
        ? 'emqx'
        : 'aws';
  const status = normalizeDeviceStatus(item.status, item.onlineStatus);
  const lastSeenAt = pickString(item.lastSeenAt);
  const activatedAt = pickString(item.activatedAt);
  const explicitIsActivated = item.isActivated;
  const inferredIsActivated =
    typeof explicitIsActivated === 'boolean'
      ? explicitIsActivated
      : Boolean(
          activatedAt
          || lastSeenAt
          || rawStatus === 'active'
          || rawStatus === 'disabled',
        );
  const marketRaw = pickString(item.market)?.toUpperCase();
  const market = marketRaw === 'CN' || marketRaw === 'US' ? marketRaw : null;

  return {
    activatedAt,
    deviceName: pickString(item.deviceName) ?? deviceSn ?? id,
    deviceType: pickString(item.deviceType) ?? productKey ?? 'smart-scale',
    firmwareVersion: pickString(item.firmwareVersion),
    id,
    isActivated: inferredIsActivated,
    lastSeenAt,
    locale: pickString(item.locale),
    market,
    metadata,
    name: pickString(item.name) ?? deviceSn ?? id,
    ownerUserId: pickString(item.ownerUserId) ?? pickString(item.boundUserId),
    productCode: pickString(item.productCode) ?? productKey ?? 'smart-scale',
    productKey,
    provider,
    providerDeviceId: pickString(item.providerDeviceId) ?? deviceSn ?? id,
    sn: pickString(item.sn) ?? deviceSn,
    status,
    tenantId: pickString(item.tenantId),
    thingName: pickString(item.thingName),
  };
}

function normalizeDeviceCommandItem(payload: unknown): DeviceApi.DeviceCommandItem {
  const item = pickObject(payload);
  const rawStatus = pickString(item.status) ?? 'pending';
  let status: DeviceApi.DeviceCommandItem['status'];
  if (
    rawStatus === 'acked' ||
    rawStatus === 'failed' ||
    rawStatus === 'pending' ||
    rawStatus === 'sent' ||
    rawStatus === 'timeout'
  ) {
    status = rawStatus;
  } else if (rawStatus === 'success') {
    status = 'acked';
  } else {
    status = 'pending';
  }

  return {
    ackedAt: pickString(item.ackedAt),
    commandType: pickString(item.commandType) ?? 'unknown',
    deviceId: pickString(item.deviceId) ?? '',
    failureReason: pickString(item.failureReason),
    id: pickString(item.id) ?? '',
    payload: pickObject(item.payload),
    requestedAt: pickString(item.requestedAt) ?? pickString(item.createdAt) ?? '',
    requestedBy: pickString(item.requestedBy) ?? 'system',
    sentAt: pickString(item.sentAt),
    status,
  };
}

function normalizePagedResult<T>(payload: unknown): PagedResult<T> {
  if (Array.isArray(payload)) {
    return {
      items: payload as T[],
      total: payload.length,
    };
  }

  if (!payload || typeof payload !== 'object') {
    return {
      items: [],
      total: 0,
    };
  }

  const target = payload as {
    data?: T[];
    items?: T[];
    pagination?: { total?: number };
    total?: number;
  };

  if (Array.isArray(target.items)) {
    return {
      items: target.items,
      total: typeof target.total === 'number' ? target.total : target.items.length,
    };
  }

  if (Array.isArray(target.data)) {
    let total: number;
    if (typeof target.pagination?.total === 'number') {
      total = target.pagination.total;
    } else if (typeof target.total === 'number') {
      total = target.total;
    } else {
      total = target.data.length;
    }
    return {
      items: target.data,
      total,
    };
  }

  return {
    items: [],
    total: 0,
  };
}

export async function getDeviceListApi(params?: { page?: number; pageSize?: number }) {
  const response = await requestClient.get<unknown>('/admin/devices', {
    params,
  });
  const result = normalizePagedResult<unknown>(response);
  return {
    items: result.items.map((item) => normalizeDeviceItem(item)),
    total: result.total,
  } satisfies PagedResult<DeviceApi.DeviceItem>;
}

export async function getDeviceDetailApi(id: string) {
  const response = await requestClient.get<unknown>(`/admin/devices/${id}`);
  return normalizeDeviceItem(response);
}

export async function createDeviceApi(data: DeviceApi.CreateDeviceParams) {
  const deviceSn = pickString(data.deviceSn) ?? pickString(data.name);
  const deviceType = pickString(data.deviceType);
  return requestClient.post('/admin/devices', {
    boundUserId: pickString(data.boundUserId) ?? undefined,
    name: pickString(data.name) ?? undefined,
    deviceSn: deviceSn ?? undefined,
    onlineStatus: data.onlineStatus ?? 'offline',
    productKey: pickString(data.productKey) ?? deviceType ?? 'default',
    status: data.status ?? 'active',
  });
}

export async function deleteDeviceApi(id: string) {
  return requestClient.delete(`/admin/devices/${id}`);
}

export async function bindDeviceApi(id: string, data: DeviceApi.BindDeviceParams) {
  return requestClient.post(`/admin/devices/${id}/bind`, data);
}

export async function getDeviceCommandsApi(id: string) {
  const response = await requestClient.get<unknown[]>(`/admin/devices/${id}/commands`);
  return Array.isArray(response) ? response.map((item) => normalizeDeviceCommandItem(item)) : [];
}

export async function getDeviceCredentialApi(
  id: string,
): Promise<DeviceApi.DeviceCredentialDetail> {
  const response = await requestClient.get<unknown>(`/admin/devices/${id}/credential`);
  const item = pickObject(response);

  return {
    available: Boolean(item.available),
    certificateArn: pickString(item.certificateArn),
    certificatePem: pickString(item.certificatePem),
    claimAvailable: Boolean(item.claimAvailable),
    claimedAt: pickString(item.claimedAt),
    credentialId: pickString(item.credentialId),
    credentialType: pickString(item.credentialType) ?? 'certificate',
    deviceId: pickString(item.deviceId) ?? id,
    endpoint: pickString(item.endpoint),
    expiresAt: pickString(item.expiresAt),
    fingerprint: pickString(item.fingerprint),
    hasDeviceSecret: Boolean(item.hasDeviceSecret),
    hasPrivateKey: Boolean(item.hasPrivateKey),
    issuedAt: pickString(item.issuedAt),
    metadata: pickObject(item.metadata),
    provider:
      pickString(item.provider) === 'aliyun'
        ? 'aliyun'
        : pickString(item.provider) === 'emqx'
          ? 'emqx'
          : 'aws',
    productKey: pickString(item.productKey),
    region: pickString(item.region),
    source: pickString(item.source) ?? 'unknown',
    status: pickString(item.status) ?? 'unknown',
    thingName: pickString(item.thingName),
    updatedAt: pickString(item.updatedAt),
    vendor: pickString(item.vendor) ?? 'unknown',
  };
}

export async function claimDeviceCredentialApi(
  id: string,
): Promise<DeviceApi.ClaimedDeviceCredentialConfig> {
  const response = await requestClient.post<unknown>(`/admin/devices/${id}/credential/claim`);
  const item = pickObject(response);
  return {
    certificateArn: pickString(item.certificateArn),
    certificatePem: pickString(item.certificatePem),
    claimedAt: pickString(item.claimedAt),
    clientId: pickString(item.clientId),
    clipboardText: String(item.clipboardText ?? ''),
    credentialId: pickString(item.credentialId),
    deviceId: pickString(item.deviceId) ?? id,
    deviceSecret: pickString(item.deviceSecret),
    deviceSn: pickString(item.deviceSn) ?? '',
    endpoint: pickString(item.endpoint),
    privateKeyPem: pickString(item.privateKeyPem),
    productKey: pickString(item.productKey),
    region: pickString(item.region),
    rootCaPem: pickString(item.rootCaPem),
    thingName: pickString(item.thingName),
    vendor: pickString(item.vendor),
  };
}

export async function requestDeviceCommandApi(
  id: string,
  data: { commandType: string; payload: Record<string, unknown> },
) {
  return requestClient.post(`/admin/devices/${id}/commands`, data);
}

function parseContentDispositionFilename(value: unknown): null | string {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  // Examples:
  // attachment; filename="device-xxx.tar.gz"
  // attachment; filename*=UTF-8''device-xxx.tar.gz
  const quoted = /filename="([^"]+)"/i.exec(value);
  if (quoted?.[1]) {
    return quoted[1];
  }
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(value);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      return star[1];
    }
  }
  const plain = /filename=([^;]+)/i.exec(value);
  return plain?.[1]?.trim() ?? null;
}

export async function downloadDeviceCredentialPackageApi(
  id: string,
): Promise<DeviceApi.DownloadedDeviceCredentialPackage> {
  const response = await requestClient.download<any>(`/admin/devices/${id}/credential/download`, {
    responseReturn: 'raw' as any,
  });
  const headers = (response?.headers ?? {}) as Record<string, unknown>;
  const mimeType =
    (typeof headers['content-type'] === 'string' && headers['content-type'].trim()) ||
    'application/octet-stream';
  const fileName =
    parseContentDispositionFilename(headers['content-disposition']) ??
    `device-${id}-credential-package.tar.gz`;
  const blob = (response?.data as Blob) ?? new Blob([], { type: mimeType });
  return { fileName, blob, mimeType };
}

export async function rotateDeviceCredentialApi(
  id: string,
  data?: { reason?: string },
): Promise<{
  ok: boolean;
  recordId?: string;
  requestId?: string;
  status?: string;
}> {
  const response = await requestClient.post<unknown>(
    `/admin/devices/${id}/credential/rotate`,
    data ?? {},
  );
  const item = pickObject(response);
  return {
    ok: Boolean(item.ok ?? true),
    status: pickString(item.status) ?? null,
    recordId: pickString(item.recordId) ?? null,
    requestId: pickString(item.requestId) ?? null,
  } as any;
}
