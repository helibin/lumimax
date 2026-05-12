import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import type { RoleApi, UserAdminApi } from '#/api';

import { formatDateTime } from '@lumimax/utils';

import { $t } from '#/locales';

type UserActionClickFn = (payload: { code: string; row: UserAdminApi.UserItem }) => void;

export function getUserStatusOptions() {
  return [
    { color: 'success', label: $t('common.enabled'), value: 'active' },
    { color: 'default', label: $t('common.disabled'), value: 'disabled' },
  ];
}

export function useColumns(
  onActionClick: UserActionClickFn,
): VxeTableGridColumns<UserAdminApi.UserItem> {
  return [
    {
      field: 'username',
      minWidth: 180,
      title: $t('system.user.username'),
    },
    {
      field: 'nickname',
      formatter: ({ cellValue }) => cellValue || '-',
      minWidth: 160,
      title: $t('system.user.name'),
    },
    {
      cellRender: { name: 'CellTag', options: getUserStatusOptions() },
      field: 'status',
      title: $t('system.user.status'),
      width: 110,
    },
    {
      field: 'email',
      formatter: ({ cellValue }) => cellValue || '-',
      minWidth: 180,
      title: 'Email',
    },
    {
      field: 'phone',
      formatter: ({ cellValue }) => cellValue || '-',
      minWidth: 160,
      title: $t('system.user.phone'),
    },
    {
      field: 'roles',
      formatter: ({ cellValue }) =>
        Array.isArray(cellValue) && cellValue.length > 0 ? cellValue.join(', ') : '-',
      minWidth: 220,
      title: $t('system.user.roles'),
    },
    {
      field: 'lastLoginAt',
      formatter: ({ cellValue }) => formatDateTime(cellValue),
      minWidth: 180,
      title: $t('system.user.lastLoginAt'),
    },
    {
      field: 'createdAt',
      formatter: ({ cellValue }) => formatDateTime(cellValue),
      minWidth: 180,
      title: $t('system.user.createdAt'),
    },
    {
      align: 'right',
      cellRender: {
        attrs: {
          nameField: 'username',
          onClick: onActionClick,
        },
        name: 'CellOperation',
        options: ['edit'],
      },
      field: 'operation',
      fixed: 'right',
      showOverflow: false,
      title: $t('system.user.operation'),
      width: 120,
    },
  ];
}

export function useFilterSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'username',
      label: $t('system.user.username'),
    },
    {
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: getUserStatusOptions().map(({ label, value }) => ({
          label,
          value,
        })),
      },
      fieldName: 'status',
      label: $t('system.user.status'),
    },
  ];
}

export function useFormSchema(roleOptions: RoleApi.RoleItem[]): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'username',
      label: $t('system.user.username'),
      rules: 'required',
    },
    {
      component: 'Input',
      fieldName: 'nickname',
      label: $t('system.user.name'),
      rules: 'required',
    },
    {
      component: 'InputPassword',
      componentProps: {
        autocomplete: 'new-password',
      },
      fieldName: 'password',
      help: $t('system.user.passwordHelp'),
      label: $t('system.user.password'),
    },
    {
      component: 'Select',
      componentProps: {
        options: getUserStatusOptions().map(({ label, value }) => ({
          label,
          value,
        })),
      },
      defaultValue: 'active',
      fieldName: 'status',
      label: $t('system.user.status'),
      rules: 'required',
    },
    {
      component: 'Input',
      fieldName: 'email',
      label: 'Email',
    },
    {
      component: 'Input',
      fieldName: 'phone',
      label: $t('system.user.phone'),
    },
    {
      component: 'Select',
      componentProps: {
        allowClear: true,
        mode: 'multiple',
        options: roleOptions.map((item) => ({
          label: `${item.name} (${item.code})`,
          value: item.id,
        })),
      },
      fieldName: 'roleIds',
      label: $t('system.user.roles'),
    },
  ];
}
