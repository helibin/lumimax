<script lang="ts" setup>
import type { VbenFormSchema } from '#/adapter/form';
import type { DeviceApi, OtaApi } from '#/api';

import { computed, ref } from 'vue';

import { useVbenDrawer } from '@lumimax/common-ui';

import { Button, Progress, Table } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { cancelDeviceOtaApi, getDeviceOtaTasksApi, requestDeviceOtaUpgradeApi } from '#/api';
import { $t } from '#/locales';

const emit = defineEmits<{
  success: [];
}>();

const targetDevice = ref<DeviceApi.DeviceItem | null>(null);
const tasks = ref<OtaApi.OtaTaskItem[]>([]);
const loading = ref(false);

const schema: VbenFormSchema[] = [
  {
    component: 'Input',
    fieldName: 'targetVersion',
    label: $t('ota.targetVersion'),
    rules: 'required',
  },
  {
    component: 'Input',
    fieldName: 'packageUrl',
    label: $t('ota.packageUrl'),
    rules: 'required',
  },
  {
    component: 'Input',
    fieldName: 'checksum',
    label: $t('ota.checksum'),
  },
  {
    component: 'InputNumber',
    fieldName: 'packageSizeBytes',
    label: $t('ota.packageSizeBytes'),
  },
  {
    component: 'Checkbox',
    fieldName: 'force',
    renderComponentContent() {
      return {
        default: () => $t('ota.forceUpgrade'),
      };
    },
  },
];

const columns = [
  {
    dataIndex: 'firmwareVersion',
    key: 'firmwareVersion',
    title: $t('ota.targetVersion'),
  },
  {
    dataIndex: 'status',
    key: 'status',
    title: $t('ota.status'),
  },
  {
    dataIndex: 'progress',
    key: 'progress',
    title: $t('ota.progress'),
  },
  {
    dataIndex: 'createdAt',
    key: 'createdAt',
    title: $t('ota.createdAt'),
  },
];

const [Form, formApi] = useVbenForm({
  schema,
  showDefaultActions: false,
});

const [Drawer, drawerApi] = useVbenDrawer({
  onConfirm: onSubmit,
  async onOpenChange(isOpen) {
    if (!isOpen) {
      return;
    }
    targetDevice.value = drawerApi.getData<DeviceApi.DeviceItem>() ?? null;
    formApi.resetForm();
    formApi.setValues({
      checksum: '',
      force: false,
      packageSizeBytes: undefined,
      packageUrl: '',
      targetVersion: '',
    });
    await loadTasks();
  },
});

const drawerTitle = computed(() => `${$t('ota.manage')} - ${targetDevice.value?.name ?? ''}`);

async function loadTasks() {
  if (!targetDevice.value?.id) {
    tasks.value = [];
    return;
  }
  loading.value = true;
  try {
    tasks.value = await getDeviceOtaTasksApi(targetDevice.value.id);
  } finally {
    loading.value = false;
  }
}

function canCancel(task?: OtaApi.OtaTaskItem) {
  if (!task) {
    return false;
  }
  return !['canceled', 'failed', 'success'].includes(task.status);
}

async function onCancelLatest() {
  if (!targetDevice.value?.id) {
    return;
  }
  drawerApi.lock();
  try {
    await cancelDeviceOtaApi(targetDevice.value.id);
    await loadTasks();
    emit('success');
  } finally {
    drawerApi.unlock();
  }
}

async function onSubmit() {
  const { valid } = await formApi.validate();
  if (!valid || !targetDevice.value?.id) {
    return;
  }
  drawerApi.lock();
  try {
    const values = await formApi.getValues<{
      checksum?: string;
      force?: boolean;
      packageSizeBytes?: number;
      packageUrl: string;
      targetVersion: string;
    }>();
    await requestDeviceOtaUpgradeApi(targetDevice.value.id, {
      ...(values.checksum?.trim() ? { checksum: values.checksum.trim() } : {}),
      ...(typeof values.packageSizeBytes === 'number'
        ? { packageSizeBytes: values.packageSizeBytes }
        : {}),
      force: values.force === true,
      packageUrl: values.packageUrl.trim(),
      targetVersion: values.targetVersion.trim(),
    });
    await loadTasks();
    emit('success');
  } finally {
    drawerApi.unlock();
  }
}
</script>

<template>
  <Drawer :title="drawerTitle" class="w-[900px] max-w-full">
    <div class="space-y-4">
      <Form />
      <div class="flex justify-end gap-2">
        <Button @click="loadTasks">
          {{ $t('common.refresh') }}
        </Button>
        <Button danger :disabled="!canCancel(tasks[0])" @click="onCancelLatest">
          {{ $t('ota.cancelLatest') }}
        </Button>
      </div>
      <Table
        :columns="columns"
        :data-source="tasks"
        :loading="loading"
        :pagination="false"
        row-key="id"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'progress'">
            <Progress :percent="record.progress" size="small" />
          </template>
          <template v-else-if="column.key === 'status'">
            {{ $t(`ota.statusLabel.${record.status}`) }}
          </template>
        </template>
      </Table>
      <div v-for="task in tasks" :key="`${task.id}-error`" class="text-xs text-muted-foreground">
        <template v-if="task.errorCode || task.errorMessage">
          {{ task.id }}: {{ task.errorCode || '-' }} /
          {{ task.errorMessage || '-' }}
        </template>
      </div>
    </div>
  </Drawer>
</template>
