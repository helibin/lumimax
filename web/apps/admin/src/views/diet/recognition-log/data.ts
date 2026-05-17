import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import type { DietApi } from '#/api';

import { formatDateTime } from '@lumimax/utils';

import { $t } from '#/locales';

type RecognitionActionClickFn = (payload: {
  code: string;
  row: DietApi.RecognitionLogItem;
}) => void;

export function useColumns(
  onActionClick: RecognitionActionClickFn,
): VxeTableGridColumns<DietApi.RecognitionLogItem> {
  return [
    {
      field: 'createdAt',
      formatter: ({ cellValue }) => formatDateTime(cellValue),
      minWidth: 180,
      title: $t('diet.createdAt'),
    },
    {
      field: 'deviceId',
      minWidth: 180,
      title: $t('diet.deviceId'),
    },
    {
      field: 'mealRecordId',
      minWidth: 180,
      title: $t('diet.mealRecordId'),
    },
    {
      field: 'provider',
      minWidth: 140,
      title: $t('diet.provider'),
    },
    {
      field: 'status',
      minWidth: 120,
      title: $t('diet.status'),
    },
    {
      field: 'latencyMs',
      formatter: ({ cellValue }) => cellValue ?? '-',
      minWidth: 120,
      title: $t('diet.latencyMs'),
    },
    {
      field: 'requestId',
      minWidth: 220,
      title: $t('diet.requestId'),
    },
    {
      align: 'right',
      cellRender: {
        attrs: {
          nameField: 'requestId',
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
