<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { IotApi } from '#/api';

import { Page, useVbenDrawer } from '@lumimax/common-ui';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getRecognitionLogListApi } from '#/api';
import { $t } from '#/locales';

import { useColumns } from './data';
import Detail from './modules/detail.vue';

type RecognitionActionClickParams = {
  code: string;
  row: IotApi.RecognitionLogItem;
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
    proxyConfig: {
      ajax: {
        query: async ({ page }) => {
          const response = await getRecognitionLogListApi({
            page: page.currentPage,
            pageSize: page.pageSize,
          });
          return {
            items: response.items as IotApi.RecognitionLogItem[],
            total: response.total,
          };
        },
      },
    },
    rowConfig: {
      keyField: 'id',
    },
    toolbarConfig: {
      custom: true,
      export: false,
      refresh: true,
      search: false,
      zoom: true,
    },
  } as VxeTableGridOptions<IotApi.RecognitionLogItem>,
});

function onActionClick({ code, row }: RecognitionActionClickParams) {
  if (code === 'detail') {
    detailDrawerApi.setData(row).open();
  }
}
</script>

<template>
  <Page auto-content-height>
    <DetailDrawer />
    <Grid :table-title="$t('iot.recognitionTitle')" />
  </Page>
</template>
