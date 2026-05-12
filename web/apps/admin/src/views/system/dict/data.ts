import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import type { DictApi } from '#/api';

import { $t } from '#/locales';

type DictTypeActionClickFn = (payload: { code: string; row: DictApi.DictTypeItem }) => void;

export function useColumns(
  onActionClick: DictTypeActionClickFn,
): VxeTableGridColumns<DictApi.DictTypeItem> {
  return [
    {
      field: 'name',
      minWidth: 180,
      title: $t('system.dict.name'),
    },
    {
      field: 'code',
      minWidth: 180,
      title: $t('system.dict.dictType'),
    },
    {
      field: 'description',
      minWidth: 220,
      title: $t('system.dict.description'),
    },
    {
      field: 'status',
      minWidth: 100,
      title: $t('system.dict.status'),
    },
    {
      align: 'right',
      cellRender: {
        attrs: {
          nameField: 'name',
          onClick: onActionClick,
        },
        name: 'CellOperation',
        options: [{ code: 'detail', text: $t('system.dict.items') }, 'edit', 'delete'],
      },
      field: 'operation',
      fixed: 'right',
      showOverflow: false,
      title: $t('system.dict.operation'),
      width: 220,
    },
  ];
}
