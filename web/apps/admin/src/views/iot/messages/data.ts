import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import type { IotApi } from '#/api';

import { formatDateTime } from '@lumimax/utils';

import { $t } from '#/locales';

type IotActionClickFn = (payload: { code: string; row: IotApi.IotMessageItem }) => void;

function getDirectionLabel(direction: IotApi.IotMessageItem['direction']) {
  switch (direction) {
    case 'downstream': {
      return $t('iot.directionDownstream');
    }
    case 'upstream': {
      return $t('iot.directionUpstream');
    }
    default: {
      return direction || '-';
    }
  }
}

function getStatusLabel(status: IotApi.IotMessageItem['status']) {
  switch (status) {
    case 'failed': {
      return $t('iot.statusFailed');
    }
    case 'handled': {
      return $t('iot.statusHandled');
    }
    case 'received': {
      return $t('iot.statusReceived');
    }
    case 'skipped': {
      return $t('iot.statusSkipped');
    }
    default: {
      return status || '-';
    }
  }
}

export function useFilterSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'keyword',
      label: $t('iot.keyword'),
    },
  ];
}

export function useColumns(
  onActionClick: IotActionClickFn,
): VxeTableGridColumns<IotApi.IotMessageItem> {
  return [
    {
      field: 'createdAt',
      formatter: ({ cellValue }) => formatDateTime(cellValue),
      minWidth: 180,
      title: $t('iot.createdAt'),
    },
    {
      field: 'deviceId',
      minWidth: 180,
      title: $t('iot.deviceId'),
    },
    {
      field: 'event',
      minWidth: 180,
      title: $t('iot.event'),
    },
    {
      field: 'direction',
      formatter: ({ cellValue }) => getDirectionLabel(cellValue),
      minWidth: 120,
      title: $t('iot.direction'),
    },
    {
      field: 'status',
      formatter: ({ cellValue }) => getStatusLabel(cellValue),
      minWidth: 120,
      title: $t('iot.status'),
    },
    {
      field: 'topic',
      minWidth: 280,
      title: $t('iot.topic'),
    },
    {
      field: 'requestId',
      minWidth: 240,
      title: $t('iot.requestId'),
    },
    {
      align: 'right',
      cellRender: {
        attrs: {
          nameField: 'requestId',
          onClick: onActionClick,
        },
        name: 'CellOperation',
        options: [{ code: 'detail', text: $t('iot.detail') }],
      },
      field: 'operation',
      fixed: 'right',
      showOverflow: false,
      title: $t('iot.operation'),
      width: 120,
    },
  ];
}
