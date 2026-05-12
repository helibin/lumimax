<script lang="ts" setup>
import type { WeighingApi } from '#/api';

import { computed, ref } from 'vue';

import { JsonViewer, useVbenDrawer } from '@lumimax/common-ui';
import { formatDateTime } from '@lumimax/utils';

import { Descriptions, Spin } from 'ant-design-vue';

import { getWeighingRecordDetailApi } from '#/api';
import { $t } from '#/locales';

const record = ref<null | WeighingApi.WeighingRecordItem>(null);
const loading = ref(false);

const [Drawer, drawerApi] = useVbenDrawer({
  async onOpenChange(isOpen) {
    if (!isOpen) {
      return;
    }
    const row = drawerApi.getData<WeighingApi.WeighingRecordItem>();
    if (!row?.id) {
      return;
    }
    loading.value = true;
    try {
      record.value = await getWeighingRecordDetailApi(row.id);
    } finally {
      loading.value = false;
    }
  },
});

const drawerTitle = computed(() => `${$t('diet.detail')} - ${record.value?.id ?? ''}`);
</script>

<template>
  <Drawer :title="drawerTitle" class="w-[720px] max-w-full">
    <Spin :spinning="loading">
      <div v-if="record" class="space-y-4">
        <Descriptions :column="2" bordered size="small">
          <Descriptions.Item :label="$t('diet.recordId')">
            {{ record.id }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('diet.deviceId')">
            {{ record.deviceId }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('diet.userId')">
            {{ record.userId || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('diet.tenantId')">
            {{ record.tenantId || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('diet.weight')">
            {{ record.weightValue }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('diet.unit')">
            {{ record.weightUnit }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('diet.measuredAt')">
            {{ formatDateTime(record.measuredAt) }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('diet.createdAt')">
            {{ formatDateTime(record.createdAt) }}
          </Descriptions.Item>
        </Descriptions>

        <div class="space-y-2">
          <div class="text-sm font-medium">{{ $t('diet.imageObjectIds') }}</div>
          <JsonViewer
            :value="record.imageObjectId ? [record.imageObjectId] : []"
            boxed
            copyable
            preview-mode
          />
        </div>

        <div class="space-y-2">
          <div class="text-sm font-medium">{{ $t('diet.analysisResult') }}</div>
          <JsonViewer :value="record.analysisResult ?? {}" boxed copyable preview-mode />
        </div>

        <div class="space-y-2">
          <div class="text-sm font-medium">{{ $t('diet.rawPayload') }}</div>
          <JsonViewer :value="record.rawPayload ?? {}" boxed copyable preview-mode />
        </div>
      </div>
    </Spin>
  </Drawer>
</template>
