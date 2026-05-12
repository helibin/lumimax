import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import type { RoleApi } from '#/api';

import { formatDateTime } from '@lumimax/utils';

import { $t } from '#/locales';

type RoleActionClickFn = (payload: { code: string; row: RoleApi.RoleItem }) => void;

export function useColumns(
  onActionClick: RoleActionClickFn,
): VxeTableGridColumns<RoleApi.RoleItem> {
  return [
    {
      field: 'name',
      minWidth: 180,
      title: $t('system.role.roleName'),
    },
    {
      field: 'code',
      minWidth: 180,
      title: $t('system.role.roleCode'),
    },
    {
      field: 'description',
      formatter: ({ cellValue }) => cellValue || '-',
      minWidth: 220,
      title: $t('system.role.description'),
    },
    {
      field: 'permissions',
      formatter: ({ cellValue }) =>
        Array.isArray(cellValue)
          ? cellValue
              .map((item) => item?.code || item?.name || '')
              .filter(Boolean)
              .join(', ')
          : '',
      minWidth: 260,
      title: $t('system.role.permissions'),
    },
    {
      field: 'status',
      formatter: ({ cellValue }) => cellValue || '-',
      minWidth: 100,
      title: $t('system.role.status'),
    },
    {
      field: 'updatedAt',
      formatter: ({ cellValue }) => formatDateTime(cellValue),
      minWidth: 180,
      title: $t('system.role.updatedAt'),
    },
    {
      align: 'right',
      cellRender: {
        attrs: {
          nameField: 'name',
          onClick: onActionClick,
        },
        name: 'CellOperation',
        options: ['edit'],
      },
      field: 'operation',
      fixed: 'right',
      showOverflow: false,
      title: $t('system.role.operation'),
      width: 120,
    },
  ];
}

export function useFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'code',
      label: $t('system.role.roleCode'),
      rules: 'required',
    },
    {
      component: 'Input',
      fieldName: 'name',
      label: $t('system.role.roleName'),
      rules: 'required',
    },
    {
      component: 'Textarea',
      componentProps: {
        rows: 4,
      },
      fieldName: 'description',
      label: $t('system.role.description'),
    },
  ];
}
