<script lang="ts" setup>
import type { ConfigApi } from '#/api';

import { computed, ref } from 'vue';

import { JsonViewer, useVbenDrawer } from '@lumimax/common-ui';

import { Descriptions, Spin } from 'ant-design-vue';

import { $t } from '#/locales';

const item = ref<ConfigApi.ConfigItem | null>(null);
const loading = ref(false);

const [Drawer, drawerApi] = useVbenDrawer({
  async onOpenChange(isOpen) {
    if (!isOpen) {
      return;
    }
    const row = drawerApi.getData<ConfigApi.ConfigItem>();
    if (!row?.id) {
      return;
    }
    loading.value = true;
    try {
      item.value = row;
    } finally {
      loading.value = false;
    }
  },
});

const drawerTitle = computed(() => `${$t('system.config.detail')} - ${item.value?.name ?? ''}`);

function parseValue(item: ConfigApi.ConfigItem | null) {
  if (!item) {
    return {};
  }
  if (item.value_type !== 'json') {
    return { value: item.config_value };
  }
  try {
    return JSON.parse(item.config_value);
  } catch {
    return { value: item.config_value };
  }
}
</script>

<template>
  <Drawer :title="drawerTitle" class="w-[720px] max-w-full">
    <Spin :spinning="loading">
      <div v-if="item" class="space-y-4">
        <Descriptions :column="2" bordered size="small">
          <Descriptions.Item :label="$t('system.config.name')">
            {{ item.name }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('system.config.key')">
            {{ item.config_key }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('system.config.valueType')">
            {{ item.value_type }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('system.config.groupCode')">
            {{ item.group_code || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('system.config.status')">
            {{ item.status }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('system.config.isEncrypted')">
            {{ item.is_encrypted ? $t('common.yes') : $t('common.no') }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('system.config.description')" :span="2">
            {{ item.description || '-' }}
          </Descriptions.Item>
        </Descriptions>
        <div class="space-y-2">
          <div class="text-sm font-medium">{{ $t('system.config.value') }}</div>
          <JsonViewer :value="parseValue(item)" boxed copyable preview-mode />
        </div>
      </div>
    </Spin>
  </Drawer>
</template>
