<script lang="ts" setup>
import type { DietApi } from '#/api';

import { computed, ref } from 'vue';

import { JsonViewer, useVbenDrawer } from '@lumimax/common-ui';
import { formatDateTime } from '@lumimax/utils';

import { Collapse, CollapsePanel, Descriptions, Image, Spin, Table, Tabs } from 'ant-design-vue';

import { getMealRecordDetailApi } from '#/api';
import { $t } from '#/locales';

const record = ref<DietApi.MealRecordDetail | null>(null);
const loading = ref(false);
const activeItemKey = ref<string[]>([]);

const [Drawer, drawerApi] = useVbenDrawer({
  async onOpenChange(isOpen) {
    if (!isOpen) {
      record.value = null;
      activeItemKey.value = [];
      return;
    }
    const row = drawerApi.getData<DietApi.MealRecordItem>();
    if (!row?.mealRecordId) {
      return;
    }
    loading.value = true;
    try {
      record.value = await getMealRecordDetailApi(row.mealRecordId);
    } finally {
      loading.value = false;
    }
  },
});

const drawerTitle = computed(
  () => `${$t('diet.mealDetail')} - ${record.value?.mealRecordId ?? ''}`,
);

const sortedItems = computed(() => {
  if (!record.value?.items?.length) {
    return [];
  }
  return [...record.value.items].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );
});

const itemColumns = computed(() => [
  {
    title: $t('diet.imagePreview'),
    dataIndex: 'imagePreviewUrl',
    key: 'imagePreview',
    width: 96,
  },
  { title: $t('diet.foodName'), dataIndex: 'foodName', key: 'foodName', width: 160 },
  {
    title: $t('diet.recognitionStatus'),
    dataIndex: 'recognitionStatus',
    key: 'recognitionStatus',
    width: 110,
  },
  {
    title: $t('diet.weight'),
    dataIndex: 'weight',
    key: 'weight',
    width: 90,
    customRender: ({ text }: { text: number }) => formatAmount(text),
  },
  {
    title: $t('diet.totalCalories'),
    dataIndex: 'calories',
    key: 'calories',
    width: 100,
    customRender: ({ text }: { text: number }) => formatAmount(text),
  },
  {
    title: $t('diet.protein'),
    dataIndex: 'protein',
    key: 'protein',
    width: 90,
    customRender: ({ text }: { text: number }) => formatAmount(text),
  },
  {
    title: $t('diet.fat'),
    dataIndex: 'fat',
    key: 'fat',
    width: 90,
    customRender: ({ text }: { text: number }) => formatAmount(text),
  },
  {
    title: $t('diet.carbs'),
    dataIndex: 'carbs',
    key: 'carbs',
    width: 90,
    customRender: ({ text }: { text: number }) => formatAmount(text),
  },
  { title: $t('diet.source'), dataIndex: 'source', key: 'source', width: 120 },
  {
    title: $t('diet.recognitionLatency'),
    dataIndex: 'recognitionLatencyMs',
    key: 'recognitionLatencyMs',
    width: 120,
    customRender: ({ text }: { text: number | null }) => formatRecognitionLatency(text),
  },
]);

function formatAmount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return '-';
  }
  return String(Math.round(value * 100) / 100);
}

function formatRecognitionLatency(value: null | number | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return '-';
  }
  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }
  return `${(value / 1000).toFixed(2)} s`;
}

function pickSnapshotSummary(item: DietApi.MealItem): string {
  const result = item.resultSnapshot;
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const displayName = String((result as Record<string, unknown>).displayName ?? '').trim();
    if (displayName) {
      return displayName;
    }
  }
  const recognition = item.recognitionSnapshot;
  if (recognition && typeof recognition === 'object' && !Array.isArray(recognition)) {
    const provider = String((recognition as Record<string, unknown>).provider ?? '').trim();
    if (provider) {
      return provider;
    }
  }
  return item.foodName || '-';
}

function hasSnapshots(item: DietApi.MealItem): boolean {
  return Boolean(
    item.querySnapshot
      || item.recognitionSnapshot
      || item.resultSnapshot
      || item.rawCandidates
      || item.selectedCandidate,
  );
}
</script>

<template>
  <Drawer :title="drawerTitle" class="w-[1080px] max-w-full">
    <Spin :spinning="loading">
      <template v-if="record">
        <Tabs>
          <Tabs.TabPane key="overview" :tab="$t('diet.tabOverview')">
            <Descriptions :column="2" bordered size="small">
              <Descriptions.Item :label="$t('diet.mealRecordId')" :span="2">
                {{ record.mealRecordId }}
              </Descriptions.Item>
              <Descriptions.Item :label="$t('diet.deviceId')">
                {{ record.deviceId || '-' }}
              </Descriptions.Item>
              <Descriptions.Item :label="$t('diet.userId')">
                {{ record.userId || '-' }}
              </Descriptions.Item>
              <Descriptions.Item :label="$t('diet.status')">
                {{ record.status }}
              </Descriptions.Item>
              <Descriptions.Item :label="$t('diet.market')">
                {{ record.market || '-' }} / {{ record.locale || '-' }}
              </Descriptions.Item>
              <Descriptions.Item :label="$t('diet.totalCalories')">
                {{ record.totalCalories }}
              </Descriptions.Item>
              <Descriptions.Item :label="$t('diet.totalWeight')">
                {{ formatAmount(record.totalWeight) }}
              </Descriptions.Item>
              <Descriptions.Item :label="$t('diet.startedAt')">
                {{ record.startedAt ? formatDateTime(record.startedAt) : '-' }}
              </Descriptions.Item>
              <Descriptions.Item :label="$t('diet.finishedAt')">
                {{ record.finishedAt ? formatDateTime(record.finishedAt) : '-' }}
              </Descriptions.Item>
            </Descriptions>
          </Tabs.TabPane>

          <Tabs.TabPane key="items" :tab="$t('diet.tabItems')">
            <Table
              :columns="itemColumns"
              :data-source="sortedItems"
              :pagination="false"
              :row-key="(row: DietApi.MealItem) => row.itemId"
              :scroll="{ x: 1100 }"
              size="small"
            >
              <template #bodyCell="{ column, record: item }">
                <template v-if="column.key === 'imagePreview'">
                  <Image
                    v-if="item.imagePreviewUrl"
                    :src="item.imagePreviewUrl"
                    :width="72"
                    :height="72"
                    class="rounded object-cover"
                  />
                  <span v-else class="text-gray-400">-</span>
                </template>
              </template>
            </Table>
            <div v-if="sortedItems.length === 0" class="py-6 text-center text-gray-500">
              {{ $t('diet.noItems') }}
            </div>
          </Tabs.TabPane>

          <Tabs.TabPane key="recognition" :tab="$t('diet.tabRecognition')">
            <div v-if="sortedItems.length === 0" class="py-6 text-center text-gray-500">
              {{ $t('diet.noItems') }}
            </div>
            <Collapse v-else v-model:active-key="activeItemKey">
              <CollapsePanel
                v-for="item in sortedItems"
                :key="item.itemId"
                :header="`${item.foodName} · ${pickSnapshotSummary(item)} · ${formatRecognitionLatency(item.recognitionLatencyMs)}`"
              >
                <div v-if="item.imagePreviewUrl" class="mb-3">
                  <div class="mb-1 text-sm font-medium">{{ $t('diet.imagePreview') }}</div>
                  <Image :src="item.imagePreviewUrl" :width="160" class="rounded" />
                </div>
                <Descriptions :column="2" bordered size="small" class="mb-3">
                  <Descriptions.Item :label="$t('diet.itemId')">
                    {{ item.itemId }}
                  </Descriptions.Item>
                  <Descriptions.Item :label="$t('diet.recognitionStatus')">
                    {{ item.recognitionStatus }}
                  </Descriptions.Item>
                  <Descriptions.Item :label="$t('diet.recognitionLatency')">
                    {{ formatRecognitionLatency(item.recognitionLatencyMs) }}
                  </Descriptions.Item>
                  <Descriptions.Item :label="$t('diet.weight')">
                    {{ formatAmount(item.weight) }}
                  </Descriptions.Item>
                  <Descriptions.Item :label="$t('diet.totalCalories')">
                    {{ formatAmount(item.calories) }}
                  </Descriptions.Item>
                  <Descriptions.Item :label="$t('diet.protein')">
                    {{ formatAmount(item.protein) }}
                  </Descriptions.Item>
                  <Descriptions.Item :label="$t('diet.fat')">
                    {{ formatAmount(item.fat) }}
                  </Descriptions.Item>
                  <Descriptions.Item :label="$t('diet.carbs')">
                    {{ formatAmount(item.carbs) }}
                  </Descriptions.Item>
                  <Descriptions.Item :label="$t('diet.source')">
                    {{ item.source || '-' }}
                  </Descriptions.Item>
                  <Descriptions.Item :label="$t('diet.imageKey')">
                    {{ item.imageKey || '-' }}
                  </Descriptions.Item>
                </Descriptions>

                <template v-if="hasSnapshots(item)">
                  <div class="space-y-3">
                    <div v-if="item.resultSnapshot" class="space-y-1">
                      <div class="text-sm font-medium">{{ $t('diet.resultSnapshot') }}</div>
                      <JsonViewer :value="item.resultSnapshot" boxed copyable preview-mode />
                    </div>
                    <div v-if="item.recognitionSnapshot" class="space-y-1">
                      <div class="text-sm font-medium">{{ $t('diet.recognitionSnapshot') }}</div>
                      <JsonViewer :value="item.recognitionSnapshot" boxed copyable preview-mode />
                    </div>
                    <div v-if="item.querySnapshot" class="space-y-1">
                      <div class="text-sm font-medium">{{ $t('diet.querySnapshot') }}</div>
                      <JsonViewer :value="item.querySnapshot" boxed copyable preview-mode />
                    </div>
                    <div v-if="item.rawCandidates" class="space-y-1">
                      <div class="text-sm font-medium">{{ $t('diet.rawCandidates') }}</div>
                      <JsonViewer :value="item.rawCandidates" boxed copyable preview-mode />
                    </div>
                    <div v-if="item.selectedCandidate" class="space-y-1">
                      <div class="text-sm font-medium">{{ $t('diet.selectedCandidate') }}</div>
                      <JsonViewer :value="item.selectedCandidate" boxed copyable preview-mode />
                    </div>
                  </div>
                </template>
                <div v-else class="text-sm text-gray-500">{{ $t('diet.noSnapshots') }}</div>
              </CollapsePanel>
            </Collapse>
          </Tabs.TabPane>
        </Tabs>
      </template>
    </Spin>
  </Drawer>
</template>
