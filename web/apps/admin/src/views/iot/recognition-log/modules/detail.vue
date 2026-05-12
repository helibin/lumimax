<script lang="ts" setup>
import type { IotApi } from '#/api';

import { computed, ref } from 'vue';

import { JsonViewer, useVbenDrawer } from '@lumimax/common-ui';
import { formatDateTime } from '@lumimax/utils';

import { Descriptions, Spin } from 'ant-design-vue';

import { getRecognitionLogDetailApi } from '#/api';
import { $t } from '#/locales';

const item = ref<IotApi.RecognitionLogDetail | null>(null);
const loading = ref(false);

const [Drawer, drawerApi] = useVbenDrawer({
  async onOpenChange(isOpen) {
    if (!isOpen) {
      return;
    }
    const row = drawerApi.getData<IotApi.RecognitionLogItem>();
    if (!row?.id) {
      return;
    }
    loading.value = true;
    try {
      item.value = await getRecognitionLogDetailApi(row.id);
    } finally {
      loading.value = false;
    }
  },
});

const drawerTitle = computed(() => `${$t('iot.detail')} - ${item.value?.requestId ?? ''}`);
</script>

<template>
  <Drawer :title="drawerTitle" class="w-[840px] max-w-full">
    <Spin :spinning="loading">
      <div v-if="item" class="space-y-4">
        <Descriptions :column="2" bordered size="small">
          <Descriptions.Item :label="$t('iot.requestId')">
            {{ item.requestId }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('iot.createdAt')">
            {{ formatDateTime(item.createdAt) }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('iot.deviceId')">
            {{ item.deviceId || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('iot.mealId')">
            {{ item.mealId || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('iot.provider')">
            {{ item.provider || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('iot.status')">
            {{ item.status || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('iot.latencyMs')">
            {{ item.latencyMs ?? '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('iot.imageKey')" :span="2">
            {{ item.imageKey || '-' }}
          </Descriptions.Item>
        </Descriptions>

        <div class="space-y-2">
          <div class="text-sm font-medium">{{ $t('iot.requestPayload') }}</div>
          <JsonViewer :value="item.requestPayload ?? null" boxed copyable preview-mode />
        </div>

        <div class="space-y-2">
          <div class="text-sm font-medium">{{ $t('iot.responsePayload') }}</div>
          <JsonViewer :value="item.responsePayload ?? null" boxed copyable preview-mode />
        </div>

        <div class="space-y-2">
          <div class="text-sm font-medium">{{ $t('iot.error') }}</div>
          <JsonViewer :value="item.error ?? null" boxed copyable preview-mode />
        </div>
      </div>
    </Spin>
  </Drawer>
</template>
