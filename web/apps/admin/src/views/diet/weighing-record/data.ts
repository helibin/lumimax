import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import type { WeighingApi } from '#/api';

import { formatDateTime } from '@lumimax/utils';

import { $t } from '#/locales';

type RecordActionClickFn = (payload: { code: string; row: WeighingApi.WeighingRecordItem }) => void;

export function useColumns(
  onActionClick: RecordActionClickFn,
): VxeTableGridColumns<WeighingApi.WeighingRecordItem> {
  return [
    {
      field: 'deviceId',
      minWidth: 180,
      title: $t('diet.deviceId'),
    },
    {
      field: 'userId',
      formatter: ({ cellValue }) => cellValue || '-',
      minWidth: 180,
      title: $t('diet.userId'),
    },
    {
      field: 'weightValue',
      minWidth: 100,
      title: $t('diet.weight'),
    },
    {
      field: 'weightUnit',
      minWidth: 90,
      title: $t('diet.unit'),
    },
    {
      field: 'imageObjectIds',
      formatter: ({ cellValue }) => (Array.isArray(cellValue) ? String(cellValue.length) : '0'),
      minWidth: 90,
      title: $t('diet.imageCount'),
    },
    {
      field: 'measuredAt',
      formatter: ({ cellValue }) => formatDateTime(cellValue),
      minWidth: 180,
      title: $t('diet.measuredAt'),
    },
    {
      field: 'createdAt',
      formatter: ({ cellValue }) => formatDateTime(cellValue),
      minWidth: 180,
      title: $t('diet.createdAt'),
    },
    {
      align: 'right',
      cellRender: {
        attrs: {
          nameField: 'id',
          onClick: onActionClick,
        },
        name: 'CellOperation',
        options: [{ code: 'detail', text: $t('diet.detail') }],
      },
      field: 'operation',
      fixed: 'right',
      showOverflow: false,
      title: $t('diet.operation'),
      width: 120,
    },
  ];
}

export function useFilterSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'keyword',
      label: $t('diet.keyword'),
    },
  ];
}
