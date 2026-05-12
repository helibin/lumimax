<script lang="ts" setup>
import type { IotApi } from '#/api';

import { computed, ref } from 'vue';

import { JsonViewer, useVbenDrawer } from '@lumimax/common-ui';
import { formatDateTime } from '@lumimax/utils';

import { Descriptions, Spin, Tag } from 'ant-design-vue';

import { getIotMessageDetailApi } from '#/api';
import { $t } from '#/locales';

const item = ref<IotApi.IotMessageDetail | null>(null);
const currentId = ref('');
const loading = ref(false);

const [Drawer, drawerApi] = useVbenDrawer({
  async onOpenChange(isOpen) {
    if (!isOpen) {
      item.value = null;
      currentId.value = '';
      return;
    }
    const row = drawerApi.getData<IotApi.IotMessageItem>();
    if (!row?.id) {
      return;
    }
    currentId.value = row.id;
    item.value = null;
    loading.value = true;
    try {
      item.value = await getIotMessageDetailApi(row.id);
    } finally {
      loading.value = false;
    }
  },
});

const drawerTitle = computed(
  () => `${$t('iot.detail')} - ${item.value?.requestId ?? currentId.value}`,
);

function getDirectionLabel(direction: IotApi.IotMessageDetail['direction']) {
  switch (direction) {
    case 'downstream': {
      return $t('iot.directionDownstream');
    }
    case 'upstream': {
      return $t('iot.directionUpstream');
    }
    default: {
      return direction || '-';
    }
  }
}

function getStatusColor(status: IotApi.IotMessageDetail['status']) {
  switch (status) {
    case 'failed': {
      return 'error';
    }
    case 'handled': {
      return 'success';
    }
    case 'received': {
      return 'processing';
    }
    case 'skipped': {
      return 'default';
    }
    default: {
      return 'default';
    }
  }
}

function getStatusLabel(status: IotApi.IotMessageDetail['status']) {
  switch (status) {
    case 'failed': {
      return $t('iot.statusFailed');
    }
    case 'handled': {
      return $t('iot.statusHandled');
    }
    case 'received': {
      return $t('iot.statusReceived');
    }
    case 'skipped': {
      return $t('iot.statusSkipped');
    }
    default: {
      return status || '-';
    }
  }
}
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
            {{ item.deviceId }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('iot.event')">
            {{ item.event || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('iot.direction')">
            {{ getDirectionLabel(item.direction) }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('iot.status')">
            <Tag :color="getStatusColor(item.status)">
              {{ getStatusLabel(item.status) }}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item :label="$t('iot.topic')" :span="2">
            {{ item.topic || '-' }}
          </Descriptions.Item>
        </Descriptions>

        <div class="space-y-2">
          <div class="text-sm font-medium">{{ $t('iot.payload') }}</div>
          <JsonViewer :value="item.payload ?? null" boxed copyable preview-mode />
        </div>

        <div class="space-y-2">
          <div class="text-sm font-medium">{{ $t('iot.response') }}</div>
          <JsonViewer :value="item.response ?? null" boxed copyable preview-mode />
        </div>

        <div class="space-y-2">
          <div class="text-sm font-medium">{{ $t('iot.error') }}</div>
          <JsonViewer :value="item.error ?? null" boxed copyable preview-mode />
        </div>
      </div>
    </Spin>
  </Drawer>
</template>
