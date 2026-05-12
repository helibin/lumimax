<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { NotificationApi } from '#/api';

import { Page, useVbenDrawer } from '@lumimax/common-ui';
import { Plus } from '@lumimax/icons';

import { Button } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getNotificationListApi } from '#/api';
import { $t } from '#/locales';

import { useNotificationColumns, useNotificationFilterSchema } from '../data';
import TestForm from './modules/test-form.vue';

const [TestDrawer, testDrawerApi] = useVbenDrawer({
  connectedComponent: TestForm,
  destroyOnClose: true,
});

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: useNotificationFilterSchema(),
    submitOnChange: true,
  },
  gridOptions: {
    columns: useNotificationColumns(),
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          const tenantId =
            typeof formValues?.tenantId === 'string' && formValues.tenantId.trim()
              ? formValues.tenantId.trim()
              : undefined;
          const userId =
            typeof formValues?.userId === 'string' && formValues.userId.trim()
              ? formValues.userId.trim()
              : undefined;
          const response = await getNotificationListApi({
            page: page.currentPage,
            pageSize: page.pageSize,
            tenantId,
            userId,
          });
          const keyword = String(formValues?.keyword ?? '')
            .trim()
            .toLowerCase();
          const items = response.items.filter((item) => {
            if (!keyword) {
              return true;
            }
            return [item.eventName, item.templateCode, item.title, item.content, item.userId].some(
              (field) => field.toLowerCase().includes(keyword),
            );
          });
          return {
            items,
            total: keyword ? items.length : response.total,
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
  } as VxeTableGridOptions<NotificationApi.NotificationItem>,
});

function onRefresh() {
  gridApi.query();
}

function onTest() {
  testDrawerApi.open();
}
</script>

<template>
  <Page auto-content-height>
    <TestDrawer @success="onRefresh" />
    <Grid :table-title="$t('notification.messageTitle')">
      <template #toolbar-tools>
        <Button type="primary" @click="onTest">
          <Plus class="size-5" />
          {{ $t('notification.sendTest') }}
        </Button>
      </template>
    </Grid>
  </Page>
</template>
