<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { NotificationApi } from '#/api';

import { Page, useVbenDrawer } from '@lumimax/common-ui';
import { Plus } from '@lumimax/icons';

import { Button } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getNotificationTemplateListApi } from '#/api';
import { $t } from '#/locales';

import { useTemplateColumns } from '../data';
import Form from './modules/form.vue';

type TemplateActionClickParams = {
  code: string;
  row: NotificationApi.NotificationTemplateItem;
};

const [FormDrawer, formDrawerApi] = useVbenDrawer({
  connectedComponent: Form,
  destroyOnClose: true,
});

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: {
    columns: useTemplateColumns(onActionClick),
    height: 'auto',
    keepSource: true,
    pagerConfig: {
      enabled: false,
    },
    proxyConfig: {
      ajax: {
        query: async () => await getNotificationTemplateListApi(),
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
  } as VxeTableGridOptions<NotificationApi.NotificationTemplateItem>,
});

function onRefresh() {
  gridApi.query();
}

function onCreate() {
  formDrawerApi.setData(null).open();
}

function onEdit(row: NotificationApi.NotificationTemplateItem) {
  formDrawerApi.setData(row).open();
}

function onActionClick({ code, row }: TemplateActionClickParams) {
  if (code === 'edit') {
    onEdit(row);
  }
}
</script>

<template>
  <Page auto-content-height>
    <FormDrawer @success="onRefresh" />
    <Grid :table-title="$t('notification.templateTitle')">
      <template #toolbar-tools>
        <Button type="primary" @click="onCreate">
          <Plus class="size-5" />
          {{ $t('ui.actionTitle.create', [$t('notification.templateName')]) }}
        </Button>
      </template>
    </Grid>
  </Page>
</template>
