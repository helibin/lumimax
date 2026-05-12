<script lang="ts" setup>
import type { AuditApi } from '#/api';

import { computed, ref } from 'vue';

import { JsonViewer, useVbenDrawer } from '@lumimax/common-ui';
import { formatDateTime } from '@lumimax/utils';

import { Descriptions, Spin } from 'ant-design-vue';

import { $t } from '#/locales';

const item = ref<AuditApi.AuditLogItem | null>(null);
const loading = ref(false);

const [Drawer, drawerApi] = useVbenDrawer({
  async onOpenChange(isOpen) {
    if (!isOpen) {
      return;
    }
    loading.value = true;
    try {
      item.value = drawerApi.getData<AuditApi.AuditLogItem>() ?? null;
    } finally {
      loading.value = false;
    }
  },
});

const drawerTitle = computed(() => `${$t('system.audit.detail')} - ${item.value?.action ?? ''}`);
</script>

<template>
  <Drawer :title="drawerTitle" class="w-[840px] max-w-full">
    <Spin :spinning="loading">
      <div v-if="item" class="space-y-4">
        <Descriptions :column="2" bordered size="small">
          <Descriptions.Item :label="$t('system.audit.action')">
            {{ item.action }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('system.audit.createdAt')">
            {{ formatDateTime(item.createdAt) }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('system.audit.operatorName')">
            {{ item.operatorName }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('system.audit.operatorId')">
            {{ item.operatorId }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('system.audit.resourceType')">
            {{ item.resourceType }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('system.audit.resourceId')">
            {{ item.resourceId || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('system.audit.requestId')" :span="2">
            {{ item.requestId || '-' }}
          </Descriptions.Item>
        </Descriptions>

        <div class="space-y-2">
          <div class="text-sm font-medium">{{ $t('system.audit.before') }}</div>
          <JsonViewer :value="item.before ?? null" boxed copyable preview-mode />
        </div>

        <div class="space-y-2">
          <div class="text-sm font-medium">{{ $t('system.audit.after') }}</div>
          <JsonViewer :value="item.after ?? null" boxed copyable preview-mode />
        </div>
      </div>
    </Spin>
  </Drawer>
</template>
