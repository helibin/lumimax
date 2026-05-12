import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import type { ConfigApi } from '#/api';

import { $t } from '#/locales';

type ConfigActionClickFn = (payload: { code: string; row: ConfigApi.ConfigItem }) => void;

export function useColumns(
  onActionClick: ConfigActionClickFn,
): VxeTableGridColumns<ConfigApi.ConfigItem> {
  return [
    {
      field: 'name',
      minWidth: 180,
      title: $t('system.config.name'),
    },
    {
      field: 'config_key',
      minWidth: 220,
      title: $t('system.config.key'),
    },
    {
      field: 'config_value',
      minWidth: 220,
      title: $t('system.config.value'),
    },
    {
      field: 'value_type',
      minWidth: 100,
      title: $t('system.config.valueType'),
    },
    {
      field: 'group_code',
      minWidth: 120,
      title: $t('system.config.groupCode'),
    },
    {
      align: 'right',
      cellRender: {
        attrs: {
          nameField: 'name',
          onClick: onActionClick,
        },
        name: 'CellOperation',
        options: [{ code: 'detail', text: $t('system.config.detail') }],
      },
      field: 'operation',
      fixed: 'right',
      showOverflow: false,
      title: $t('system.config.operation'),
      width: 120,
    },
  ];
}
