import { requestClient } from '#/api/request';

import { normalizeAdminItems, normalizeAdminPaged } from './admin-response';

export namespace NotificationApi {
  export type NotificationChannel = 'email' | 'push' | 'realtime' | 'sms' | 'webhook';

  export type NotificationStatus = 'failed' | 'partial_failed' | 'pending' | 'processing' | 'sent';

  export interface NotificationItem {
    content: string;
    createdAt: string;
    eventName: string;
    id: string;
    status: NotificationStatus;
    templateCode: string;
    tenantId: null | string;
    title: string;
    userId: string;
  }

  export interface NotificationTemplateItem {
    channel: NotificationChannel;
    code: string;
    contentTemplate: string;
    id: string;
    isEnabled: boolean;
    locale: string;
    titleTemplate: string;
    variablesSchema: Record<string, unknown>;
  }

  export interface DeviceTokenItem {
    appId: null | string;
    id: string;
    isActive: boolean;
    locale: null | string;
    platform: 'android' | 'ios' | 'web';
    provider: 'apns' | 'fcm' | 'jpush';
    region: null | string;
    token: string;
    userId: string;
  }

  export interface SendTestNotificationParams {
    channels?: NotificationChannel[];
    eventName: string;
    payload: Record<string, unknown>;
    templateCode: string;
    tenantId?: string;
    userId: string;
  }

  export interface CreateTemplateParams {
    channel: NotificationChannel;
    code: string;
    contentTemplate: string;
    isEnabled?: boolean;
    locale: string;
    titleTemplate: string;
    variablesSchema?: Record<string, unknown>;
  }

  export interface UpdateTemplateParams {
    contentTemplate?: string;
    isEnabled?: boolean;
    titleTemplate?: string;
    variablesSchema?: Record<string, unknown>;
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

function normalizeNotificationTemplateItem(
  payload: unknown,
): NotificationApi.NotificationTemplateItem {
  const item = pickObject(payload);
  const channel = pickString(item.channel);
  return {
    channel:
      channel === 'email' ||
      channel === 'push' ||
      channel === 'realtime' ||
      channel === 'sms' ||
      channel === 'webhook'
        ? channel
        : 'realtime',
    code: pickString(item.code) ?? '',
    contentTemplate: pickString(item.contentTemplate) ?? '',
    id: pickString(item.id) ?? '',
    isEnabled: Boolean(item.isEnabled),
    locale: pickString(item.locale) ?? 'zh-CN',
    titleTemplate: pickString(item.titleTemplate) ?? '',
    variablesSchema: pickObject(item.variablesSchema),
  };
}

function normalizeDeviceTokenItem(payload: unknown): NotificationApi.DeviceTokenItem {
  const item = pickObject(payload);
  const platform = pickString(item.platform);
  const provider = pickString(item.provider);
  return {
    appId: pickString(item.appId),
    id: pickString(item.id) ?? '',
    isActive: Boolean(item.isActive),
    locale: pickString(item.locale),
    platform: platform === 'android' || platform === 'ios' || platform === 'web' ? platform : 'web',
    provider: provider === 'apns' || provider === 'fcm' || provider === 'jpush' ? provider : 'fcm',
    region: pickString(item.region),
    token: pickString(item.token) ?? '',
    userId: pickString(item.userId) ?? '',
  };
}

function normalizeNotificationItem(payload: unknown): NotificationApi.NotificationItem {
  const item = pickObject(payload);
  const status = pickString(item.status);
  return {
    content: pickString(item.content) ?? '',
    createdAt: pickString(item.createdAt ?? item.created_at) ?? '',
    eventName: pickString(item.eventName ?? item.event_name) ?? '',
    id: pickString(item.id) ?? '',
    status:
      status === 'failed' ||
      status === 'partial_failed' ||
      status === 'pending' ||
      status === 'processing' ||
      status === 'sent'
        ? status
        : 'pending',
    templateCode: pickString(item.templateCode ?? item.template_code) ?? '',
    tenantId: pickString(item.tenantId ?? item.tenant_id),
    title: pickString(item.title) ?? '',
    userId: pickString(item.userId ?? item.user_id) ?? '',
  };
}

export async function getNotificationListApi(params?: {
  page?: number;
  pageSize?: number;
  tenantId?: string;
  userId?: string;
}) {
  const response = await requestClient.get<unknown>('/admin/notifications', {
    params,
  });
  const result = normalizeAdminPaged<unknown>(response);
  return {
    items: result.items.map((item) => normalizeNotificationItem(item)),
    total: result.total,
  } satisfies PagedResult<NotificationApi.NotificationItem>;
}

export async function sendTestNotificationApi(data: NotificationApi.SendTestNotificationParams) {
  return requestClient.post<NotificationApi.NotificationItem>('/admin/notifications/test', data);
}

export async function getNotificationTemplateListApi() {
  const response = await requestClient.get<
    | unknown[]
    | {
        items?: unknown[];
      }
  >('/admin/templates');
  const items = normalizeAdminItems(response);
  return {
    items: items.map((item) => normalizeNotificationTemplateItem(item)),
    total: items.length,
  } satisfies PagedResult<NotificationApi.NotificationTemplateItem>;
}

export async function createNotificationTemplateApi(data: NotificationApi.CreateTemplateParams) {
  return requestClient.post<NotificationApi.NotificationTemplateItem>('/admin/templates', data);
}

export async function updateNotificationTemplateApi(
  id: string,
  data: NotificationApi.UpdateTemplateParams,
) {
  return requestClient.request<NotificationApi.NotificationTemplateItem>(`/admin/templates/${id}`, {
    data,
    method: 'PATCH',
  });
}

export async function getNotificationDeviceTokenListApi() {
  const response = await requestClient.get<
    | unknown[]
    | {
        items?: unknown[];
      }
  >('/admin/device-tokens');
  const items = normalizeAdminItems(response);
  return {
    items: items.map((item) => normalizeDeviceTokenItem(item)),
    total: items.length,
  } satisfies PagedResult<NotificationApi.DeviceTokenItem>;
}
