<script lang="ts" setup>
import type { DeviceApi } from '#/api';

import { computed, ref } from 'vue';

import { JsonViewer, useVbenDrawer } from '@lumimax/common-ui';
import { formatDateTime } from '@lumimax/utils';

import { Descriptions, Spin, Tag } from 'ant-design-vue';

import { getDeviceDetailApi } from '#/api';
import { $t } from '#/locales';

const device = ref<DeviceApi.DeviceItem | null>(null);
const loading = ref(false);

const [Drawer, drawerApi] = useVbenDrawer({
  async onOpenChange(isOpen) {
    if (!isOpen) {
      return;
    }
    const row = drawerApi.getData<DeviceApi.DeviceItem & { initialShowCertificate?: boolean }>();
    if (!row?.id) {
      return;
    }
    loading.value = true;
    try {
      device.value = null;
      device.value = await getDeviceDetailApi(row.id);
    } finally {
      loading.value = false;
    }
  },
});

const drawerTitle = computed(() => `${$t('device.detail')} - ${device.value?.name ?? ''}`);

const resolvedThingName = computed(() => device.value?.thingName || '-');

const resolvedIsActivated = computed(() => {
  if (device.value) {
    return device.value.isActivated;
  }
  return false;
});

function formatTime(value?: null | string) {
  return value ? formatDateTime(value) : '-';
}

function getStatusColor(status?: DeviceApi.DeviceStatus) {
  switch (status) {
    case 'disabled': {
      return 'error';
    }
    case 'offline': {
      return 'default';
    }
    case 'online': {
      return 'success';
    }
    default: {
      return 'processing';
    }
  }
}
</script>

<template>
  <Drawer :title="drawerTitle" class="w-[720px] max-w-full">
    <Spin :spinning="loading">
      <div v-if="device" class="space-y-4">
        <Descriptions :column="2" bordered size="small">
          <Descriptions.Item :label="$t('device.name')">
            {{ device.name }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.status')">
            <Tag :color="getStatusColor(device.status)">
              {{ $t(`device.statusLabel.${device.status}`) }}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.id')">
            {{ device.id }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.deviceId')">
            {{ device.providerDeviceId }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.sn')">
            {{ device.sn || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.provider')">
            {{ device.provider }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.market')">
            {{ device.market || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.type')">
            {{ device.deviceType }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.productCode')">
            {{ device.productCode }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.productKey')">
            {{ device.productKey || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.thingName')">
            {{ resolvedThingName }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.tenantId')">
            {{ device.tenantId || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.ownerUserId')">
            {{ device.ownerUserId || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.firmwareVersion')">
            {{ device.firmwareVersion || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.isActivated')">
            {{ resolvedIsActivated ? $t('common.yes') : $t('common.no') }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.activatedAt')">
            {{ formatTime(device.activatedAt) }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.lastSeenAt')">
            {{ formatTime(device.lastSeenAt) }}
          </Descriptions.Item>
        </Descriptions>
        <div class="space-y-2">
          <div class="text-sm font-medium">{{ $t('device.metadata') }}</div>
          <JsonViewer :value="device.metadata ?? {}" boxed copyable preview-mode />
        </div>
      </div>
    </Spin>
  </Drawer>
</template>
