<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { MenuApi } from '#/api';

import { Page, useVbenDrawer } from '@lumimax/common-ui';
import { IconifyIcon, Plus } from '@lumimax/icons';

import { Button, message } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { deleteMenuApi, getMenuTreeApi } from '#/api';
import { $t } from '#/locales';

import { useColumns } from './data';
import Form from './modules/form.vue';

type MenuActionClickParams = {
  code: string;
  row: MenuApi.MenuTreeItem;
};

const [FormDrawer, formDrawerApi] = useVbenDrawer({
  connectedComponent: Form,
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
        query: async () => await getMenuTreeApi(),
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
    treeConfig: {
      transform: false,
    },
  } as VxeTableGridOptions<MenuApi.MenuTreeItem>,
});

function onRefresh() {
  gridApi.query();
}

function onEdit(row: MenuApi.MenuTreeItem) {
  formDrawerApi.setData(row).open();
}

function onCreate() {
  formDrawerApi.setData(null).open();
}

function onAppend(row: MenuApi.MenuTreeItem) {
  formDrawerApi.setData({ parentId: row.id }).open();
}

function onDelete(row: MenuApi.MenuTreeItem) {
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deleting', [row.name]),
    duration: 0,
    key: 'action_process_msg',
  });
  deleteMenuApi(row.id)
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

function onActionClick({ code, row }: MenuActionClickParams) {
  switch (code) {
    case 'append': {
      onAppend(row);
      break;
    }
    case 'delete': {
      onDelete(row);
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
    <FormDrawer @success="onRefresh" />
    <Grid :table-title="$t('system.menu.title')">
      <template #toolbar-tools>
        <Button type="primary" @click="onCreate">
          <Plus class="size-5" />
          {{ $t('ui.actionTitle.create', [$t('system.menu.name')]) }}
        </Button>
      </template>
      <template #name="{ row }">
        <div class="flex w-full items-center gap-2">
          <IconifyIcon
            v-if="row.icon"
            :icon="row.icon"
            class="size-4 shrink-0 text-muted-foreground"
          />
          <IconifyIcon
            v-else-if="row.menuType === 'button'"
            icon="carbon:security"
            class="size-4 shrink-0 text-muted-foreground"
          />
          <span class="truncate">{{ row.name }}</span>
        </div>
      </template>
    </Grid>
  </Page>
</template>
