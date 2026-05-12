import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import type { AuditApi } from '#/api';

import { formatDateTime } from '@lumimax/utils';

import { $t } from '#/locales';

type AuditActionClickFn = (payload: { code: string; row: AuditApi.AuditLogItem }) => void;

export function useFilterSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'keyword',
      label: $t('system.audit.keyword'),
    },
    {
      component: 'Input',
      fieldName: 'resourceType',
      label: $t('system.audit.resourceType'),
    },
    {
      component: 'Input',
      fieldName: 'action',
      label: $t('system.audit.action'),
    },
    {
      component: 'DatePicker',
      componentProps: {
        showTime: true,
      },
      fieldName: 'startAt',
      label: $t('system.audit.startAt'),
    },
    {
      component: 'DatePicker',
      componentProps: {
        showTime: true,
      },
      fieldName: 'endAt',
      label: $t('system.audit.endAt'),
    },
  ];
}

export function useColumns(
  onActionClick: AuditActionClickFn,
): VxeTableGridColumns<AuditApi.AuditLogItem> {
  return [
    {
      field: 'createdAt',
      formatter: ({ cellValue }) => formatDateTime(cellValue),
      minWidth: 180,
      title: $t('system.audit.createdAt'),
    },
    {
      field: 'operatorName',
      minWidth: 140,
      title: $t('system.audit.operatorName'),
    },
    {
      field: 'operatorId',
      minWidth: 180,
      title: $t('system.audit.operatorId'),
    },
    {
      field: 'action',
      minWidth: 220,
      title: $t('system.audit.action'),
    },
    {
      field: 'resourceType',
      minWidth: 160,
      title: $t('system.audit.resourceType'),
    },
    {
      field: 'resourceId',
      formatter: ({ cellValue }) => cellValue || '-',
      minWidth: 180,
      title: $t('system.audit.resourceId'),
    },
    {
      field: 'requestId',
      formatter: ({ cellValue }) => cellValue || '-',
      minWidth: 220,
      title: $t('system.audit.requestId'),
    },
    {
      align: 'right',
      cellRender: {
        attrs: {
          nameField: 'action',
          onClick: onActionClick,
        },
        name: 'CellOperation',
        options: [{ code: 'detail', text: $t('system.audit.detail') }],
      },
      field: 'operation',
      fixed: 'right',
      showOverflow: false,
      title: $t('system.audit.operation'),
      width: 120,
    },
  ];
}
