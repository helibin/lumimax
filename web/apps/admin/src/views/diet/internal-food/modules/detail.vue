<script lang="ts" setup>
import type { DietApi } from '#/api';

import { computed, ref } from 'vue';

import { useVbenDrawer } from '@lumimax/common-ui';

import { Descriptions, DescriptionsItem, Spin } from 'ant-design-vue';

import { getInternalFoodDetailApi } from '#/api';
import { $t } from '#/locales';

const record = ref<DietApi.InternalFoodItem | null>(null);
const loading = ref(false);

const [Drawer, drawerApi] = useVbenDrawer({
  async onOpenChange(isOpen) {
    if (!isOpen) {
      record.value = null;
      return;
    }
    const row = drawerApi.getData<DietApi.InternalFoodItem>();
    if (!row?.id) {
      return;
    }
    loading.value = true;
    try {
      record.value = await getInternalFoodDetailApi(row.id);
    } finally {
      loading.value = false;
    }
  },
});

const drawerTitle = computed(
  () => `${$t('diet.internalFoodDetail')} - ${record.value?.name ?? ''}`,
);
</script>

<template>
  <Drawer :title="drawerTitle">
    <Spin :spinning="loading">
      <Descriptions v-if="record" bordered :column="1" size="small">
        <DescriptionsItem :label="$t('diet.recordId')">{{ record.id }}</DescriptionsItem>
        <DescriptionsItem :label="$t('diet.foodName')">{{ record.name }}</DescriptionsItem>
        <DescriptionsItem :label="$t('diet.brand')">{{ record.brand || '-' }}</DescriptionsItem>
        <DescriptionsItem :label="$t('diet.source')">{{ record.source || '-' }}</DescriptionsItem>
        <DescriptionsItem :label="$t('diet.sourceRefId')">{{ record.sourceRefId || '-' }}</DescriptionsItem>
        <DescriptionsItem :label="$t('diet.status')">{{ record.status }}</DescriptionsItem>
        <DescriptionsItem :label="$t('diet.countryCode')">{{ record.countryCode || '-' }}</DescriptionsItem>
        <DescriptionsItem :label="$t('diet.servingSize')">
          {{ record.servingSize }} {{ record.servingUnit }}
        </DescriptionsItem>
        <DescriptionsItem :label="$t('diet.totalCalories')">{{ record.caloriesPer100g }} / 100g</DescriptionsItem>
        <DescriptionsItem :label="$t('diet.protein')">{{ record.proteinPer100g }} / 100g</DescriptionsItem>
        <DescriptionsItem :label="$t('diet.fat')">{{ record.fatPer100g }} / 100g</DescriptionsItem>
        <DescriptionsItem :label="$t('diet.carbs')">{{ record.carbsPer100g }} / 100g</DescriptionsItem>
        <DescriptionsItem :label="$t('diet.createdAt')">{{ record.createdAt || '-' }}</DescriptionsItem>
        <DescriptionsItem :label="$t('diet.updatedAt')">{{ record.updatedAt || '-' }}</DescriptionsItem>
      </Descriptions>
    </Spin>
  </Drawer>
</template>
