<script lang="ts" setup>
import type { AnalysisOverviewItem } from '@lumimax/common-ui';
import type { TabOption } from '@lumimax/types';

import { computed, onMounted, ref } from 'vue';

import { AnalysisChartCard, AnalysisChartsTabs, AnalysisOverview } from '@lumimax/common-ui';
import { SvgBellIcon, SvgCakeIcon, SvgCardIcon, SvgDownloadIcon } from '@lumimax/icons';

import { getDashboardOverviewApi } from '#/api';

import AnalyticsTrends from './analytics-trends.vue';
import AnalyticsVisitsData from './analytics-visits-data.vue';
import AnalyticsVisitsSales from './analytics-visits-sales.vue';
import AnalyticsVisitsSource from './analytics-visits-source.vue';
import AnalyticsVisits from './analytics-visits.vue';

const overview = ref({
  deviceTotal: 0,
  onlineDeviceTotal: 0,
  todayMealTotal: 0,
  todayNewUsers: 0,
  todayRecognitionFailedTotal: 0,
  todayRecognitionTotal: 0,
  userTotal: 0,
});

const overviewItems = computed<AnalysisOverviewItem[]>(() => [
  {
    icon: SvgCardIcon,
    title: '新增用户',
    totalTitle: '总用户量',
    totalValue: overview.value.userTotal,
    value: overview.value.todayNewUsers,
  },
  {
    icon: SvgCakeIcon,
    title: '今日餐次',
    totalTitle: '总设备量',
    totalValue: overview.value.deviceTotal,
    value: overview.value.todayMealTotal,
  },
  {
    icon: SvgDownloadIcon,
    title: '在线设备',
    totalTitle: '设备在线数',
    totalValue: overview.value.deviceTotal,
    value: overview.value.onlineDeviceTotal,
  },
  {
    icon: SvgBellIcon,
    title: '今日识别',
    totalTitle: '识别失败数',
    totalValue: overview.value.todayRecognitionTotal,
    value: overview.value.todayRecognitionFailedTotal,
  },
]);

const chartTabs: TabOption[] = [
  {
    label: '流量趋势',
    value: 'trends',
  },
  {
    label: '月访问量',
    value: 'visits',
  },
];

onMounted(async () => {
  const data = await getDashboardOverviewApi();
  overview.value = {
    deviceTotal: data.deviceTotal,
    onlineDeviceTotal: data.onlineDeviceTotal,
    todayMealTotal: data.todayMealTotal,
    todayNewUsers: data.todayNewUsers,
    todayRecognitionFailedTotal: data.todayRecognitionFailedTotal,
    todayRecognitionTotal: data.todayRecognitionTotal,
    userTotal: data.userTotal,
  };
});
</script>

<template>
  <div class="p-5">
    <AnalysisOverview :items="overviewItems" />
    <AnalysisChartsTabs :tabs="chartTabs" class="mt-5">
      <template #trends>
        <AnalyticsTrends />
      </template>
      <template #visits>
        <AnalyticsVisits />
      </template>
    </AnalysisChartsTabs>

    <div class="mt-5 w-full md:flex">
      <AnalysisChartCard class="mt-5 md:mt-0 md:mr-4 md:w-1/3" title="访问数量">
        <AnalyticsVisitsData />
      </AnalysisChartCard>
      <AnalysisChartCard class="mt-5 md:mt-0 md:mr-4 md:w-1/3" title="访问来源">
        <AnalyticsVisitsSource />
      </AnalysisChartCard>
      <AnalysisChartCard class="mt-5 md:mt-0 md:w-1/3" title="访问来源">
        <AnalyticsVisitsSales />
      </AnalysisChartCard>
    </div>
  </div>
</template>
