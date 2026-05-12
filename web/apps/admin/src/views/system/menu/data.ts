import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import type { MenuApi } from '#/api';

import { $t } from '#/locales';

type MenuActionClickFn = (payload: { code: string; row: MenuApi.MenuTreeItem }) => void;

export function getMenuTypeOptions() {
  return [
    {
      color: 'processing',
      label: $t('system.menu.typeCatalog'),
      value: 'catalog',
    },
    {
      color: 'default',
      label: $t('system.menu.typeMenu'),
      value: 'menu',
    },
    {
      color: 'error',
      label: $t('system.menu.typeButton'),
      value: 'button',
    },
    {
      color: 'warning',
      label: $t('system.menu.typeExternal'),
      value: 'external',
    },
  ];
}

export function useColumns(
  onActionClick: MenuActionClickFn,
): VxeTableGridColumns<MenuApi.MenuTreeItem> {
  return [
    {
      align: 'left',
      field: 'name',
      fixed: 'left',
      slots: { default: 'name' },
      title: $t('system.menu.menuName'),
      treeNode: true,
      minWidth: 260,
    },
    {
      cellRender: { name: 'CellTag', options: getMenuTypeOptions() },
      field: 'menuType',
      title: $t('system.menu.type'),
      width: 110,
    },
    {
      align: 'left',
      field: 'code',
      minWidth: 180,
      title: $t('system.menu.menuCode'),
    },
    {
      align: 'left',
      field: 'routePath',
      minWidth: 200,
      title: $t('system.menu.path'),
    },
    {
      align: 'left',
      field: 'component',
      minWidth: 220,
      title: $t('system.menu.component'),
    },
    {
      field: 'sort',
      title: $t('system.menu.sortNo'),
      width: 90,
    },
    {
      cellRender: {
        name: 'CellTag',
        options: [
          { color: 'success', label: $t('common.enabled'), value: 'active' },
          { color: 'default', label: $t('common.disabled'), value: 'disabled' },
        ],
      },
      field: 'status',
      title: $t('system.menu.status'),
      width: 110,
    },
    {
      align: 'right',
      cellRender: {
        attrs: {
          nameField: 'name',
          onClick: onActionClick,
        },
        name: 'CellOperation',
        options: [
          {
            code: 'append',
            text: $t('system.menu.appendChild'),
          },
          'edit',
          'delete',
        ],
      },
      field: 'operation',
      fixed: 'right',
      showOverflow: false,
      title: $t('system.menu.operation'),
      width: 220,
    },
  ];
}
