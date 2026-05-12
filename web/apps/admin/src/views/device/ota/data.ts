import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import type { DeviceApi } from '#/api';

import { formatDateTime } from '@lumimax/utils';

import { $t } from '#/locales';

type DeviceActionClickFn = (payload: { code: string; row: DeviceApi.DeviceItem }) => void;

export function useColumns(
  onActionClick: DeviceActionClickFn,
): VxeTableGridColumns<DeviceApi.DeviceItem> {
  return [
    {
      field: 'name',
      minWidth: 180,
      title: $t('device.name'),
    },
    {
      field: 'id',
      minWidth: 180,
      title: $t('device.id'),
    },
    {
      field: 'deviceType',
      minWidth: 140,
      title: $t('device.type'),
    },
    {
      field: 'firmwareVersion',
      formatter: ({ cellValue }) => cellValue || '-',
      minWidth: 120,
      title: $t('device.firmwareVersion'),
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
        options: [{ code: 'ota', text: $t('ota.manage') }],
      },
      field: 'operation',
      fixed: 'right',
      showOverflow: false,
      title: $t('ota.operation'),
      width: 120,
    },
  ];
}
