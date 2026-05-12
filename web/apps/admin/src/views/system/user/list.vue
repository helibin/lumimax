<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { UserAdminApi } from '#/api';

import { Page, useVbenDrawer } from '@lumimax/common-ui';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getUserListApi } from '#/api';

import { useColumns, useFilterSchema } from './data';
import Form from './modules/form.vue';

type UserActionClickParams = {
  code: string;
  row: UserAdminApi.UserItem;
};

const [FormDrawer, formDrawerApi] = useVbenDrawer({
  connectedComponent: Form,
  destroyOnClose: true,
});

const [Grid, gridApi] = useVbenVxeGrid({
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
          const response = await getUserListApi({
            page: page.currentPage,
            pageSize: page.pageSize,
          });

          const username = String(formValues?.username ?? '')
            .trim()
            .toLowerCase();
          const status = String(formValues?.status ?? '').trim();
          if (!username) {
            if (!status) {
              return response;
            }
            return {
              items: response.items.filter((item) => item.status === status),
              total: response.items.filter((item) => item.status === status).length,
            };
          }

          const items = response.items.filter(
            (item) =>
              item.username.toLowerCase().includes(username) && (!status || item.status === status),
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
  } as VxeTableGridOptions<UserAdminApi.UserItem>,
});

function onRefresh() {
  gridApi.query();
}

function onEdit(row: UserAdminApi.UserItem) {
  formDrawerApi.setData(row).open();
}

function onActionClick({ code, row }: UserActionClickParams) {
  switch (code) {
    case 'edit': {
      onEdit(row);
      break;
    }
  }
}
</script>

<template>
  <Page auto-content-height>
    <FormDrawer @success="onRefresh" />
    <Grid />
  </Page>
</template>
