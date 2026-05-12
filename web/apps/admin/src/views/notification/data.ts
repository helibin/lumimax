import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import type { NotificationApi } from '#/api';

import { formatDateTime } from '@lumimax/utils';

import { $t } from '#/locales';

type NotificationActionClickFn = (payload: {
  code: string;
  row: NotificationApi.NotificationTemplateItem;
}) => void;

export function getNotificationChannelOptions() {
  return [
    {
      color: 'processing',
      label: $t('notification.channelRealtime'),
      value: 'realtime',
    },
    { color: 'success', label: $t('notification.channelPush'), value: 'push' },
    {
      color: 'default',
      label: $t('notification.channelEmail'),
      value: 'email',
    },
    { color: 'warning', label: $t('notification.channelSms'), value: 'sms' },
    {
      color: 'error',
      label: $t('notification.channelWebhook'),
      value: 'webhook',
    },
  ];
}

export function getNotificationStatusOptions() {
  return [
    {
      color: 'default',
      label: $t('notification.statusPending'),
      value: 'pending',
    },
    {
      color: 'processing',
      label: $t('notification.statusProcessing'),
      value: 'processing',
    },
    { color: 'success', label: $t('notification.statusSent'), value: 'sent' },
    {
      color: 'warning',
      label: $t('notification.statusPartialFailed'),
      value: 'partial_failed',
    },
    { color: 'error', label: $t('notification.statusFailed'), value: 'failed' },
  ];
}

export function getDeviceTokenPlatformOptions() {
  return [
    {
      color: 'processing',
      label: $t('notification.platformIos'),
      value: 'ios',
    },
    {
      color: 'success',
      label: $t('notification.platformAndroid'),
      value: 'android',
    },
    { color: 'default', label: $t('notification.platformWeb'), value: 'web' },
  ];
}

export function getDeviceTokenProviderOptions() {
  return [
    { color: 'processing', label: 'APNS', value: 'apns' },
    { color: 'success', label: 'FCM', value: 'fcm' },
    { color: 'warning', label: 'JPush', value: 'jpush' },
  ];
}

export function useNotificationColumns(): VxeTableGridColumns<NotificationApi.NotificationItem> {
  return [
    {
      field: 'eventName',
      minWidth: 180,
      title: $t('notification.eventName'),
    },
    {
      field: 'templateCode',
      minWidth: 160,
      title: $t('notification.templateCode'),
    },
    {
      field: 'userId',
      minWidth: 220,
      title: $t('notification.userId'),
    },
    {
      field: 'tenantId',
      formatter: ({ cellValue }) => cellValue || '-',
      minWidth: 200,
      title: $t('notification.tenantId'),
    },
    {
      field: 'title',
      minWidth: 220,
      title: $t('notification.titleField'),
    },
    {
      cellRender: { name: 'CellTag', options: getNotificationStatusOptions() },
      field: 'status',
      title: $t('notification.status'),
      width: 140,
    },
    {
      field: 'createdAt',
      formatter: ({ cellValue }) => formatDateTime(cellValue),
      minWidth: 180,
      title: $t('notification.createdAt'),
    },
  ];
}

export function useNotificationFilterSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'userId',
      label: $t('notification.userId'),
    },
    {
      component: 'Input',
      fieldName: 'tenantId',
      label: $t('notification.tenantId'),
    },
    {
      component: 'Input',
      fieldName: 'keyword',
      label: $t('notification.keyword'),
    },
  ];
}

export function useTemplateColumns(
  onActionClick: NotificationActionClickFn,
): VxeTableGridColumns<NotificationApi.NotificationTemplateItem> {
  return [
    {
      field: 'code',
      minWidth: 160,
      title: $t('notification.templateCode'),
    },
    {
      cellRender: { name: 'CellTag', options: getNotificationChannelOptions() },
      field: 'channel',
      title: $t('notification.channel'),
      width: 120,
    },
    {
      field: 'locale',
      minWidth: 120,
      title: $t('notification.locale'),
    },
    {
      field: 'titleTemplate',
      minWidth: 220,
      title: $t('notification.titleTemplate'),
    },
    {
      field: 'contentTemplate',
      minWidth: 300,
      title: $t('notification.contentTemplate'),
    },
    {
      cellRender: {
        name: 'CellTag',
        options: [
          { color: 'success', label: $t('common.enabled'), value: true },
          { color: 'default', label: $t('common.disabled'), value: false },
        ],
      },
      field: 'isEnabled',
      title: $t('notification.isEnabled'),
      width: 110,
    },
    {
      align: 'right',
      cellRender: {
        attrs: {
          nameField: 'code',
          onClick: onActionClick,
        },
        name: 'CellOperation',
        options: ['edit'],
      },
      field: 'operation',
      fixed: 'right',
      showOverflow: false,
      title: $t('notification.operation'),
      width: 120,
    },
  ];
}

export function useDeviceTokenColumns(): VxeTableGridColumns<NotificationApi.DeviceTokenItem> {
  return [
    {
      field: 'userId',
      minWidth: 220,
      title: $t('notification.userId'),
    },
    {
      cellRender: { name: 'CellTag', options: getDeviceTokenPlatformOptions() },
      field: 'platform',
      title: $t('notification.platform'),
      width: 120,
    },
    {
      cellRender: { name: 'CellTag', options: getDeviceTokenProviderOptions() },
      field: 'provider',
      title: $t('notification.provider'),
      width: 120,
    },
    {
      field: 'token',
      minWidth: 320,
      title: $t('notification.token'),
    },
    {
      field: 'appId',
      formatter: ({ cellValue }) => cellValue || '-',
      minWidth: 160,
      title: $t('notification.appId'),
    },
    {
      field: 'region',
      formatter: ({ cellValue }) => cellValue || '-',
      minWidth: 100,
      title: $t('notification.region'),
    },
    {
      field: 'locale',
      formatter: ({ cellValue }) => cellValue || '-',
      minWidth: 100,
      title: $t('notification.locale'),
    },
    {
      cellRender: {
        name: 'CellTag',
        options: [
          { color: 'success', label: $t('common.enabled'), value: true },
          { color: 'default', label: $t('common.disabled'), value: false },
        ],
      },
      field: 'isActive',
      title: $t('notification.isActive'),
      width: 110,
    },
  ];
}
