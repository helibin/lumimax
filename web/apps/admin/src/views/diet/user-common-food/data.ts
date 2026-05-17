import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import type { DietApi } from '#/api';

import { formatDateTime } from '@lumimax/utils';

import { $t } from '#/locales';

type UserCommonFoodActionClickFn = (payload: {
  code: string;
  row: DietApi.UserCommonFoodItem;
}) => void;

export function useColumns(
  onActionClick: UserCommonFoodActionClickFn,
): VxeTableGridColumns<DietApi.UserCommonFoodItem> {
  return [
    {
      field: 'userId',
      minWidth: 180,
      title: $t('diet.userId'),
    },
    {
      field: 'foodName',
      minWidth: 160,
      title: $t('diet.foodName'),
    },
    {
      field: 'usageCount',
      minWidth: 100,
      title: $t('diet.usageCount'),
    },
    {
      field: 'defaultWeightGram',
      formatter: ({ cellValue }) => (cellValue != null ? String(cellValue) : '-'),
      minWidth: 120,
      title: $t('diet.defaultWeightGram'),
    },
    {
      field: 'caloriesPer100g',
      formatter: ({ cellValue }) => (cellValue != null ? String(cellValue) : '-'),
      minWidth: 110,
      title: $t('diet.totalCalories'),
    },
    {
      field: 'foodId',
      formatter: ({ cellValue }) => cellValue || '-',
      minWidth: 180,
      title: $t('diet.recordId'),
    },
    {
      field: 'lastUsedAt',
      formatter: ({ cellValue }) => formatDateTime(cellValue),
      minWidth: 180,
      title: $t('diet.lastUsedAt'),
    },
    {
      align: 'right',
      cellRender: {
        attrs: {
          nameField: 'foodName',
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
