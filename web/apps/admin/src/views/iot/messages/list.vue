<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { IotApi } from '#/api';

import { Page, useVbenDrawer } from '@lumimax/common-ui';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getIotMessageListApi } from '#/api';
import { $t } from '#/locales';

import { useColumns, useFilterSchema } from './data';
import Detail from './modules/detail.vue';

type IotActionClickParams = {
  code: string;
  row: IotApi.IotMessageItem;
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
          const response = await getIotMessageListApi({
            keyword: String(formValues?.keyword ?? '').trim() || undefined,
            page: page.currentPage,
            pageSize: page.pageSize,
          });
          return {
            items: response.items as IotApi.IotMessageItem[],
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
      search: true,
      zoom: true,
    },
  } as VxeTableGridOptions<IotApi.IotMessageItem>,
});

function onActionClick({ code, row }: IotActionClickParams) {
  if (code === 'detail') {
    detailDrawerApi.setData(row).open();
  }
}
</script>

<template>
  <Page auto-content-height>
    <DetailDrawer />
    <Grid :table-title="$t('iot.title')" />
  </Page>
</template>
