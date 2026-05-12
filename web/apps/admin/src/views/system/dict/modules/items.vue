<script lang="ts" setup>
import type { DictApi } from '#/api';

import { computed, ref } from 'vue';

import { JsonViewer, useVbenDrawer } from '@lumimax/common-ui';
import { Plus } from '@lumimax/icons';

import { Button, message, Popconfirm, Table } from 'ant-design-vue';

import { deleteDictItemApi, getDictItemsApi } from '#/api';
import { $t } from '#/locales';

import ItemForm from './item-form.vue';

const target = ref<DictApi.DictTypeItem | null>(null);
const items = ref<DictApi.DictItem[]>([]);
const loading = ref(false);

const columns = [
  { dataIndex: 'label', key: 'label', title: $t('system.dict.itemLabel') },
  { dataIndex: 'id', key: 'id', title: $t('system.dict.itemCode') },
  { dataIndex: 'value', key: 'value', title: $t('system.dict.itemValue') },
  { dataIndex: 'status', key: 'status', title: $t('system.dict.status') },
  {
    dataIndex: 'operation',
    key: 'operation',
    title: $t('system.dict.operation'),
    width: 120,
  },
];

const [ItemFormDrawer, itemFormDrawerApi] = useVbenDrawer({
  connectedComponent: ItemForm,
  destroyOnClose: true,
});

async function loadItems() {
  if (!target.value?.code) {
    items.value = [];
    return;
  }
  loading.value = true;
  try {
    const result = await getDictItemsApi(target.value.code);
    items.value = result.items;
  } finally {
    loading.value = false;
  }
}

const [Drawer, drawerApi] = useVbenDrawer({
  async onOpenChange(isOpen) {
    if (!isOpen) {
      return;
    }
    target.value = drawerApi.getData<DictApi.DictTypeItem>() ?? null;
    if (!target.value?.code) {
      return;
    }
    await loadItems();
  },
});

const drawerTitle = computed(() => `${$t('system.dict.items')} - ${target.value?.name ?? ''}`);

function onCreate() {
  if (!target.value) {
    return;
  }
  itemFormDrawerApi.setData(target.value).open();
}

function onEdit(item: DictApi.DictItem) {
  if (!target.value) {
    return;
  }
  itemFormDrawerApi
    .setData({
      item,
      target: target.value,
    })
    .open();
}

async function onDelete(item: DictApi.DictItem) {
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deleting', [item.label]),
    duration: 0,
    key: 'action_process_msg',
  });
  try {
    await deleteDictItemApi(item.id);
    message.success({
      content: $t('ui.actionMessage.deleteSuccess', [item.label]),
      key: 'action_process_msg',
    });
    await loadItems();
  } catch {
    hideLoading();
  }
}
</script>

<template>
  <Drawer :title="drawerTitle" class="w-[900px] max-w-full">
    <div class="space-y-4">
      <ItemFormDrawer @success="loadItems" />
      <div class="flex justify-end">
        <Button type="primary" @click="onCreate">
          <Plus class="size-5" />
          {{ $t('ui.actionTitle.create', [$t('system.dict.items')]) }}
        </Button>
      </div>
      <Table
        :columns="columns"
        :data-source="items"
        :loading="loading"
        :pagination="false"
        row-key="id"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'operation'">
            <div class="flex items-center gap-2">
              <Button size="small" type="link" @click="onEdit(record as DictApi.DictItem)">
                {{ $t('common.edit') }}
              </Button>
              <Popconfirm
                :title="$t('ui.actionMessage.deleteConfirm', [record.label])"
                @confirm="onDelete(record as DictApi.DictItem)"
              >
                <Button danger size="small" type="link">
                  {{ $t('common.delete') }}
                </Button>
              </Popconfirm>
            </div>
          </template>
        </template>
      </Table>
      <div
        v-for="item in items"
        :key="`${item.id}-json`"
        class="space-y-2 rounded-md border border-border px-3 py-3"
      >
        <div class="text-sm font-medium">{{ item.label }} / {{ item.id }}</div>
        <JsonViewer
          :value="item.extra_json ? JSON.parse(item.extra_json) : {}"
          boxed
          copyable
          preview-mode
        />
      </div>
    </div>
  </Drawer>
</template>
