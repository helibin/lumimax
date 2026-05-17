import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import type { DietApi } from '#/api';

import { formatDateTime } from '@lumimax/utils';

import { $t } from '#/locales';

type InternalFoodActionClickFn = (payload: {
  code: string;
  row: DietApi.InternalFoodItem;
}) => void;

export function useColumns(
  onActionClick: InternalFoodActionClickFn,
): VxeTableGridColumns<DietApi.InternalFoodItem> {
  return [
    {
      field: 'name',
      minWidth: 160,
      title: $t('diet.foodName'),
    },
    {
      field: 'brand',
      formatter: ({ cellValue }) => cellValue || '-',
      minWidth: 120,
      title: $t('diet.brand'),
    },
    {
      field: 'source',
      formatter: ({ cellValue }) => cellValue || '-',
      minWidth: 120,
      title: $t('diet.source'),
    },
    {
      field: 'status',
      minWidth: 100,
      title: $t('diet.status'),
    },
    {
      field: 'caloriesPer100g',
      formatter: ({ cellValue }) => (cellValue != null ? String(cellValue) : '-'),
      minWidth: 110,
      title: $t('diet.totalCalories'),
    },
    {
      field: 'countryCode',
      formatter: ({ cellValue }) => cellValue || '-',
      minWidth: 90,
      title: $t('diet.countryCode'),
    },
    {
      field: 'updatedAt',
      formatter: ({ cellValue }) => formatDateTime(cellValue),
      minWidth: 180,
      title: $t('diet.updatedAt'),
    },
    {
      align: 'right',
      cellRender: {
        attrs: {
          nameField: 'name',
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
