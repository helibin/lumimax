<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { WeighingApi } from '#/api';

import { Page, useVbenDrawer } from '@lumimax/common-ui';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getWeighingRecordListApi } from '#/api';
import { $t } from '#/locales';

import { useColumns, useFilterSchema } from './data';
import Detail from './modules/detail.vue';

type RecordActionClickParams = {
  code: string;
  row: WeighingApi.WeighingRecordItem;
};

const [DetailDrawer, detailDrawerApi] = useVbenDrawer({
  connectedComponent: Detail,
  destroyOnClose: true,
});

const [Grid] = useVbenVxeGrid({
  formOptions: {
    schema: useFilterSchema(),
    submitOnChange: true,
  },
  gridOptions: {
    columns: useColumns(onActionClick),
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          const response = await getWeighingRecordListApi({
            page: page.currentPage,
            pageSize: page.pageSize,
          });
          const keyword = String(formValues?.keyword ?? '')
            .trim()
            .toLowerCase();
          if (!keyword) {
            return response;
          }
          const items = response.items.filter(
            (item) =>
              item.id.toLowerCase().includes(keyword) ||
              item.deviceId.toLowerCase().includes(keyword) ||
              (item.userId ?? '').toLowerCase().includes(keyword),
          );
          return {
            items,
            total: items.length,
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
      search: true,
      zoom: true,
    },
  } as VxeTableGridOptions<WeighingApi.WeighingRecordItem>,
});

function onActionClick({ code, row }: RecordActionClickParams) {
  if (code === 'detail') {
    detailDrawerApi.setData(row).open();
  }
}
</script>

<template>
  <Page auto-content-height>
    <DetailDrawer />
    <Grid :table-title="$t('diet.title')" />
  </Page>
</template>
