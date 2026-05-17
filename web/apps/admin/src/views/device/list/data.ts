import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import type { DeviceApi } from '#/api';

import dayjs from 'dayjs';

import { $t } from '#/locales';

type DeviceActionClickFn = (payload: { code: string; row: DeviceApi.DeviceItem }) => void;

function formatDateTime(value?: null | string) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-';
}

export function getDeviceStatusOptions() {
  return [
    { color: 'default', label: $t('device.statusInactive'), value: 'inactive' },
    { color: 'success', label: $t('device.statusOnline'), value: 'online' },
    { color: 'default', label: $t('device.statusOffline'), value: 'offline' },
    { color: 'error', label: $t('device.statusDisabled'), value: 'disabled' },
  ];
}

export function getDeviceProviderOptions() {
  return [
    { color: 'processing', label: 'AWS', value: 'aws' },
    { color: 'warning', label: 'Aliyun', value: 'aliyun' },
  ];
}

export function getDeviceMarketOptions() {
  return [
    { color: 'success', label: 'US', value: 'US' },
    { color: 'processing', label: 'CN', value: 'CN' },
  ];
}

export function getDeviceCommandStatusOptions() {
  return [
    {
      color: 'default',
      label: $t('device.commandStatusPending'),
      value: 'pending',
    },
    {
      color: 'processing',
      label: $t('device.commandStatusSent'),
      value: 'sent',
    },
    {
      color: 'success',
      label: $t('device.commandStatusAcked'),
      value: 'acked',
    },
    {
      color: 'warning',
      label: $t('device.commandStatusTimeout'),
      value: 'timeout',
    },
    {
      color: 'error',
      label: $t('device.commandStatusFailed'),
      value: 'failed',
    },
  ];
}

export function useColumns(
  onActionClick: DeviceActionClickFn,
  options: {
    canViewCredential: boolean;
  },
): VxeTableGridColumns<DeviceApi.DeviceItem> {
  const operationOptions: Array<any> = [{ code: 'detail', text: $t('device.detail') }];
  if (options.canViewCredential) {
    operationOptions.push({
      code: 'credential',
      text: $t('device.viewCertificateInfo'),
    });
  }
  operationOptions.push(
    { code: 'command', text: $t('device.command') },
    { code: 'bind', text: $t('device.bind') },
    'delete',
  );

  return [
    {
      field: 'id',
      minWidth: 180,
      title: $t('device.id'),
    },
    {
      field: 'name',
      minWidth: 180,
      title: $t('device.name'),
    },
    {
      field: 'sn',
      formatter: ({ cellValue }) => cellValue || '-',
      minWidth: 160,
      title: $t('device.sn'),
    },
    {
      cellRender: { name: 'CellTag', options: getDeviceProviderOptions() },
      field: 'provider',
      title: $t('device.provider'),
      width: 100,
    },
    {
      cellRender: { name: 'CellTag', options: getDeviceMarketOptions() },
      field: 'market',
      formatter: ({ cellValue }) => cellValue || '-',
      title: $t('device.market'),
      width: 100,
    },
    {
      field: 'deviceType',
      minWidth: 140,
      title: $t('device.type'),
    },
    {
      cellRender: { name: 'CellTag', options: getDeviceStatusOptions() },
      field: 'status',
      title: $t('device.status'),
      width: 110,
    },
    {
      field: 'firmwareVersion',
      formatter: ({ cellValue }) => cellValue || '-',
      minWidth: 120,
      title: $t('device.firmwareVersion'),
    },
    {
      field: 'tenantId',
      formatter: ({ cellValue }) => cellValue || '-',
      minWidth: 180,
      title: $t('device.tenantId'),
    },
    {
      field: 'lastSeenAt',
      formatter: ({ cellValue }) => formatDateTime(cellValue),
      minWidth: 180,
      title: $t('device.lastSeenAt'),
    },
    {
      align: 'right',
      cellRender: {
        attrs: {
          nameField: 'name',
          onClick: onActionClick,
        },
        name: 'CellOperation',
        options: operationOptions,
      },
      field: 'operation',
      fixed: 'right',
      showOverflow: false,
      title: $t('device.operation'),
      width: 360,
    },
  ];
}

export function useFilterSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'keyword',
      label: $t('device.keyword'),
    },
    {
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: getDeviceStatusOptions().map(({ label, value }) => ({
          label,
          value,
        })),
      },
      fieldName: 'status',
      label: $t('device.status'),
    },
  ];
}
