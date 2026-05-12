<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { DeviceApi } from '#/api';

import { Page, useVbenDrawer } from '@lumimax/common-ui';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getDeviceListApi } from '#/api';
import { $t } from '#/locales';

import { useColumns } from './data';
import ManageDrawer from './modules/manage.vue';

type DeviceActionClickParams = {
  code: string;
  row: DeviceApi.DeviceItem;
};

const [Manage, manageDrawerApi] = useVbenDrawer({
  connectedComponent: ManageDrawer,
  destroyOnClose: true,
});

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: {
    columns: useColumns(onActionClick),
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }) =>
          await getDeviceListApi({
            page: page.currentPage,
            pageSize: page.pageSize,
          }),
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
  } as VxeTableGridOptions<DeviceApi.DeviceItem>,
});

function onRefresh() {
  gridApi.query();
}

function onActionClick({ code, row }: DeviceActionClickParams) {
  if (code === 'ota') {
    manageDrawerApi.setData(row).open();
  }
}
</script>

<template>
  <Page auto-content-height>
    <Manage @success="onRefresh" />
    <Grid :table-title="$t('ota.title')" />
  </Page>
</template>
