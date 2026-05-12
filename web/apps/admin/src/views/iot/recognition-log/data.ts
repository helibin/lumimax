import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import type { IotApi } from '#/api';

import { formatDateTime } from '@lumimax/utils';

import { $t } from '#/locales';

type RecognitionActionClickFn = (payload: { code: string; row: IotApi.RecognitionLogItem }) => void;

export function useColumns(
  onActionClick: RecognitionActionClickFn,
): VxeTableGridColumns<IotApi.RecognitionLogItem> {
  return [
    {
      field: 'createdAt',
      formatter: ({ cellValue }) => formatDateTime(cellValue),
      minWidth: 180,
      title: $t('iot.createdAt'),
    },
    {
      field: 'deviceId',
      minWidth: 180,
      title: $t('iot.deviceId'),
    },
    {
      field: 'mealId',
      minWidth: 180,
      title: $t('iot.mealId'),
    },
    {
      field: 'provider',
      minWidth: 140,
      title: $t('iot.provider'),
    },
    {
      field: 'status',
      minWidth: 120,
      title: $t('iot.status'),
    },
    {
      field: 'latencyMs',
      formatter: ({ cellValue }) => cellValue ?? '-',
      minWidth: 120,
      title: $t('iot.latencyMs'),
    },
    {
      field: 'requestId',
      minWidth: 220,
      title: $t('iot.requestId'),
    },
    {
      align: 'right',
      cellRender: {
        attrs: {
          nameField: 'requestId',
          onClick: onActionClick,
        },
        name: 'CellOperation',
        options: [{ code: 'detail', text: $t('iot.detail') }],
      },
      field: 'operation',
      fixed: 'right',
      showOverflow: false,
      title: $t('iot.operation'),
      width: 120,
    },
  ];
}
