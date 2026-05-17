<script lang="ts" setup>
import type { DietApi } from '#/api';

import { computed, ref } from 'vue';

import { JsonViewer, useVbenDrawer } from '@lumimax/common-ui';
import { formatDateTime } from '@lumimax/utils';

import { Descriptions, Spin, Tabs } from 'ant-design-vue';

import { getDietRecognitionLogDetailApi } from '#/api';
import { $t } from '#/locales';

const item = ref<DietApi.RecognitionLogDetail | null>(null);
const loading = ref(false);

const [Drawer, drawerApi] = useVbenDrawer({
  async onOpenChange(isOpen) {
    if (!isOpen) {
      item.value = null;
      return;
    }
    const row = drawerApi.getData<DietApi.RecognitionLogItem>();
    if (!row?.id) {
      return;
    }
    loading.value = true;
    try {
      item.value = await getDietRecognitionLogDetailApi(row.id);
    } finally {
      loading.value = false;
    }
  },
});

const drawerTitle = computed(
  () => `${$t('diet.recognitionDetail')} - ${item.value?.requestId ?? ''}`,
);

const recognitionSummary = computed(() => {
  const payload = item.value?.responsePayload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const resultSnapshot = pickObject(record.resultSnapshot);
  const recognitionSnapshot = pickObject(record.recognitionSnapshot);
  const querySnapshot = pickObject(record.querySnapshot);
  return {
    foodName: pickString(record.foodName) || pickString(resultSnapshot.displayName),
    itemId: pickString(record.itemId),
    mealRecordId:
      pickString(record.mealRecordId) || pickString(record.mealId) || item.value?.mealRecordId,
    provider:
      pickString(recognitionSnapshot.provider)
      || pickString(pickObject(querySnapshot.recognition).provider),
    confidence: pickNumber(recognitionSnapshot.confidence),
    verifiedLevel: pickString(resultSnapshot.verifiedLevel),
    source: pickString(resultSnapshot.sourceCode) || pickString(record.source),
  };
});

function pickObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function pickNumber(value: unknown): null | number {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
</script>

<template>
  <Drawer :title="drawerTitle" class="w-[900px] max-w-full">
    <Spin :spinning="loading">
      <div v-if="item" class="space-y-4">
        <Descriptions :column="2" bordered size="small">
          <Descriptions.Item :label="$t('diet.requestId')">
            {{ item.requestId }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('diet.createdAt')">
            {{ formatDateTime(item.createdAt) }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('diet.deviceId')">
            {{ item.deviceId || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('diet.mealRecordId')">
            {{ item.mealRecordId || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('diet.provider')">
            {{ item.provider || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('diet.status')">
            {{ item.status || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('diet.latencyMs')">
            {{ item.latencyMs ?? '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('diet.imageKey')" :span="2">
            {{ item.imageKey || '-' }}
          </Descriptions.Item>
        </Descriptions>

        <Tabs v-if="recognitionSummary">
          <Tabs.TabPane key="summary" :tab="$t('diet.tabSummary')">
            <Descriptions :column="2" bordered size="small">
              <Descriptions.Item :label="$t('diet.foodName')">
                {{ recognitionSummary.foodName || '-' }}
              </Descriptions.Item>
              <Descriptions.Item :label="$t('diet.itemId')">
                {{ recognitionSummary.itemId || '-' }}
              </Descriptions.Item>
              <Descriptions.Item :label="$t('diet.provider')">
                {{ recognitionSummary.provider || '-' }}
              </Descriptions.Item>
              <Descriptions.Item :label="$t('diet.confidence')">
                {{
                  recognitionSummary.confidence != null
                    ? recognitionSummary.confidence
                    : '-'
                }}
              </Descriptions.Item>
              <Descriptions.Item :label="$t('diet.verifiedLevel')">
                {{ recognitionSummary.verifiedLevel || '-' }}
              </Descriptions.Item>
              <Descriptions.Item :label="$t('diet.source')">
                {{ recognitionSummary.source || '-' }}
              </Descriptions.Item>
            </Descriptions>
          </Tabs.TabPane>
        </Tabs>

        <div class="space-y-2">
          <div class="text-sm font-medium">{{ $t('diet.requestPayload') }}</div>
          <JsonViewer :value="item.requestPayload ?? null" boxed copyable preview-mode />
        </div>

        <div class="space-y-2">
          <div class="text-sm font-medium">{{ $t('diet.responsePayload') }}</div>
          <JsonViewer :value="item.responsePayload ?? null" boxed copyable preview-mode />
        </div>

        <div class="space-y-2">
          <div class="text-sm font-medium">{{ $t('diet.error') }}</div>
          <JsonViewer :value="item.error ?? null" boxed copyable preview-mode />
        </div>
      </div>
    </Spin>
  </Drawer>
</template>
