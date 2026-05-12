<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { DictApi } from '#/api';

import { Page, useVbenDrawer } from '@lumimax/common-ui';
import { Plus } from '@lumimax/icons';

import { Button, message } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { deleteDictTypeApi, getDictTypeListApi } from '#/api';
import { $t } from '#/locales';

import { useColumns } from './data';
import FormDrawer from './modules/form.vue';
import ItemsDrawer from './modules/items.vue';

type DictActionClickParams = {
  code: string;
  row: DictApi.DictTypeItem;
};

const [Items, itemsDrawerApi] = useVbenDrawer({
  connectedComponent: ItemsDrawer,
  destroyOnClose: true,
});

const [Form, formDrawerApi] = useVbenDrawer({
  connectedComponent: FormDrawer,
  destroyOnClose: true,
});

const [Grid, gridApi] = useVbenVxeGrid({
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
          const result = await getDictTypeListApi();
          return result.items;
        },
      },
    },
    rowConfig: {
      keyField: 'code',
    },
    toolbarConfig: {
      custom: true,
      export: false,
      refresh: true,
      zoom: true,
    },
  } as VxeTableGridOptions<DictApi.DictTypeItem>,
});

function onRefresh() {
  gridApi.query();
}

function onCreate() {
  formDrawerApi.setData(null).open();
}

function onEdit(row: DictApi.DictTypeItem) {
  formDrawerApi.setData(row).open();
}

function onDelete(row: DictApi.DictTypeItem) {
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deleting', [row.name]),
    duration: 0,
    key: 'action_process_msg',
  });
  deleteDictTypeApi(row.code)
    .then(() => {
      message.success({
        content: $t('ui.actionMessage.deleteSuccess', [row.name]),
        key: 'action_process_msg',
      });
      onRefresh();
    })
    .catch(() => {
      hideLoading();
    });
}

function onActionClick({ code, row }: DictActionClickParams) {
  switch (code) {
    case 'delete': {
      onDelete(row);
      break;
    }
    case 'detail': {
      itemsDrawerApi.setData(row).open();
      break;
    }
    case 'edit': {
      onEdit(row);
      break;
    }
  }
}
</script>

<template>
  <Page auto-content-height>
    <Form @success="onRefresh" />
    <Items />
    <Grid :table-title="$t('system.dict.title')">
      <template #toolbar-tools>
        <Button type="primary" @click="onCreate">
          <Plus class="size-5" />
          {{ $t('ui.actionTitle.create', [$t('system.dict.name')]) }}
        </Button>
      </template>
    </Grid>
  </Page>
</template>
