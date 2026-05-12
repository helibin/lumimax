<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { NotificationApi } from '#/api';

import { Page } from '@lumimax/common-ui';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getNotificationDeviceTokenListApi } from '#/api';
import { $t } from '#/locales';

import { useDeviceTokenColumns } from '../data';

const [Grid] = useVbenVxeGrid({
  gridOptions: {
    columns: useDeviceTokenColumns(),
    height: 'auto',
    keepSource: true,
    pagerConfig: {
      enabled: false,
    },
    proxyConfig: {
      ajax: {
        query: async () => await getNotificationDeviceTokenListApi(),
      },
    },
    rowConfig: {
      keyField: 'id',
    },
    toolbarConfig: {
      custom: true,
      export: false,
      refresh: true,
      zoom: true,
    },
  } as VxeTableGridOptions<NotificationApi.DeviceTokenItem>,
});
</script>

<template>
  <Page auto-content-height>
    <Grid :table-title="$t('notification.deviceTokenTitle')" />
  </Page>
</template>
