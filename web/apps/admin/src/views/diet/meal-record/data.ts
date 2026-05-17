import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import type { DietApi } from '#/api';

import { formatDateTime } from '@lumimax/utils';

import { $t } from '#/locales';

type MealActionClickFn = (payload: { code: string; row: DietApi.MealRecordItem }) => void;

export function useColumns(
  onActionClick: MealActionClickFn,
): VxeTableGridColumns<DietApi.MealRecordItem> {
  return [
    {
      field: 'mealRecordId',
      minWidth: 200,
      title: $t('diet.mealRecordId'),
    },
    {
      field: 'deviceId',
      formatter: ({ cellValue }) => cellValue || '-',
      minWidth: 180,
      title: $t('diet.deviceId'),
    },
    {
      field: 'status',
      minWidth: 110,
      title: $t('diet.status'),
    },
    {
      field: 'totalCalories',
      formatter: ({ cellValue }) => (cellValue != null ? String(cellValue) : '-'),
      minWidth: 100,
      title: $t('diet.totalCalories'),
    },
    {
      field: 'totalWeight',
      formatter: ({ cellValue }) => (cellValue != null ? String(cellValue) : '-'),
      minWidth: 100,
      title: $t('diet.totalWeight'),
    },
    {
      field: 'market',
      formatter: ({ cellValue }) => cellValue || '-',
      minWidth: 80,
      title: $t('diet.market'),
    },
    {
      field: 'startedAt',
      formatter: ({ cellValue }) => formatDateTime(cellValue),
      minWidth: 180,
      title: $t('diet.startedAt'),
    },
    {
      align: 'right',
      cellRender: {
        attrs: {
          nameField: 'mealRecordId',
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
