<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { ConfigApi } from '#/api';

import { Page, useVbenDrawer } from '@lumimax/common-ui';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getConfigItemListApi } from '#/api';
import { $t } from '#/locales';

import { useColumns } from './data';
import Detail from './modules/detail.vue';

type ConfigActionClickParams = {
  code: string;
  row: ConfigApi.ConfigItem;
};

const [DetailDrawer, detailDrawerApi] = useVbenDrawer({
  connectedComponent: Detail,
  destroyOnClose: true,
});

const [Grid] = useVbenVxeGrid({
  gridOptions: {
    columns: useColumns(onActionClick),
    height: 'auto',
    keepSource: true,
    pagerConfig: {
      enabled: false,
    },
    proxyConfig: {
      ajax: {
        query: async () => {
          const result = await getConfigItemListApi();
          return result.items;
        },
      },
    },
    rowConfig: {
      keyField: 'config_key',
    },
    toolbarConfig: {
      custom: true,
      export: false,
      refresh: true,
      zoom: true,
    },
  } as VxeTableGridOptions<ConfigApi.ConfigItem>,
});

function onActionClick({ code, row }: ConfigActionClickParams) {
  if (code === 'detail') {
    detailDrawerApi.setData(row).open();
  }
}
</script>

<template>
  <Page auto-content-height>
    <DetailDrawer />
    <Grid :table-title="$t('system.config.title')" />
  </Page>
</template>
