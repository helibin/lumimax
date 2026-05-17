<script lang="ts" setup>
import type { DietApi } from '#/api';

import { computed } from 'vue';

import { useVbenDrawer } from '@lumimax/common-ui';
import { Descriptions, DescriptionsItem } from 'ant-design-vue';

import { $t } from '#/locales';

const [Drawer, drawerApi] = useVbenDrawer();

const record = computed(() => drawerApi.getData<DietApi.UserCommonFoodItem>());
</script>

<template>
  <Drawer :title="$t('diet.userCommonFoodDetail')">
    <Descriptions v-if="record" bordered :column="1" size="small">
      <DescriptionsItem :label="$t('diet.userId')">{{ record.userId }}</DescriptionsItem>
      <DescriptionsItem :label="$t('diet.foodName')">{{ record.foodName }}</DescriptionsItem>
      <DescriptionsItem :label="$t('diet.canonicalName')">{{ record.canonicalName }}</DescriptionsItem>
      <DescriptionsItem :label="$t('diet.normalizedName')">{{ record.normalizedName }}</DescriptionsItem>
      <DescriptionsItem :label="$t('diet.recordId')">{{ record.foodId || '-' }}</DescriptionsItem>
      <DescriptionsItem :label="$t('diet.source')">{{ record.source }}</DescriptionsItem>
      <DescriptionsItem :label="$t('diet.usageCount')">{{ record.usageCount }}</DescriptionsItem>
      <DescriptionsItem :label="$t('diet.defaultWeightGram')">{{ record.defaultWeightGram }}</DescriptionsItem>
      <DescriptionsItem :label="$t('diet.totalCalories')">{{ record.caloriesPer100g }} / 100g</DescriptionsItem>
      <DescriptionsItem :label="$t('diet.protein')">{{ record.proteinPer100g }} / 100g</DescriptionsItem>
      <DescriptionsItem :label="$t('diet.fat')">{{ record.fatPer100g }} / 100g</DescriptionsItem>
      <DescriptionsItem :label="$t('diet.carbs')">{{ record.carbsPer100g }} / 100g</DescriptionsItem>
      <DescriptionsItem :label="$t('diet.lastUsedAt')">{{ record.lastUsedAt || '-' }}</DescriptionsItem>
    </Descriptions>
  </Drawer>
</template>
