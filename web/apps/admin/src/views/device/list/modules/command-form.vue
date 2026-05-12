<script lang="ts" setup>
import type { VbenFormSchema } from '#/adapter/form';
import type { DeviceApi, DictApi } from '#/api';

import { computed, ref } from 'vue';

import { JsonViewer, useVbenDrawer } from '@lumimax/common-ui';
import { formatDateTime } from '@lumimax/utils';

import { Button, Spin } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { getDeviceCommandsApi, getDictItemsApi, requestDeviceCommandApi } from '#/api';
import { $t } from '#/locales';

import { getDeviceCommandStatusOptions } from '../data';

const emit = defineEmits<{
  success: [];
}>();

const targetDevice = ref<DeviceApi.DeviceItem | null>(null);
const commands = ref<DeviceApi.DeviceCommandItem[]>([]);
const commandTypeOptions = ref<Array<{ label: string; value: string }>>([]);
const loading = ref(false);
const loadingCommandTypes = ref(false);

const DEVICE_COMMAND_TYPE_DICT = 'device_command_type';

function getSchema(options: Array<{ label: string; value: string }>): VbenFormSchema[] {
  return [
    {
      component: options.length > 0 ? 'Select' : 'Input',
      componentProps:
        options.length > 0
          ? {
              allowClear: true,
              options,
              placeholder: $t('device.commandType'),
              showSearch: true,
            }
          : {},
      fieldName: 'commandType',
      label: $t('device.commandType'),
      rules: 'required',
    },
    {
      component: 'Textarea',
      componentProps: {
        rows: 6,
      },
      fieldName: 'payloadJson',
      help: $t('device.commandPayloadHelp'),
      label: $t('device.commandPayload'),
    },
  ];
}

const [Form, formApi] = useVbenForm({
  schema: getSchema([]),
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
    await ensureCommandTypeOptionsLoaded();
    formApi.updateSchema(getSchema(commandTypeOptions.value));
    formApi.setValues({
      commandType: '',
      payloadJson: '{}',
    });
    await loadCommands();
  },
});

const drawerTitle = computed(() => `${$t('device.command')} - ${targetDevice.value?.name ?? ''}`);

function getStatusLabel(status: DeviceApi.DeviceCommandItem['status']) {
  return getDeviceCommandStatusOptions().find((item) => item.value === status)?.label ?? status;
}

async function loadCommands() {
  if (!targetDevice.value?.id) {
    commands.value = [];
    return;
  }
  loading.value = true;
  try {
    commands.value = await getDeviceCommandsApi(targetDevice.value.id);
  } finally {
    loading.value = false;
  }
}

async function ensureCommandTypeOptionsLoaded() {
  if (commandTypeOptions.value.length > 0 || loadingCommandTypes.value) {
    return;
  }
  loadingCommandTypes.value = true;
  try {
    const result = await getDictItemsApi(DEVICE_COMMAND_TYPE_DICT, {
      status: 'active',
    });
    commandTypeOptions.value = result.items
      .map((item: DictApi.DictItem) => ({
        label: item.label || item.value,
        value: item.value,
      }))
      .filter((item) => item.value);
  } catch {
    commandTypeOptions.value = [];
  } finally {
    loadingCommandTypes.value = false;
  }
}

function parsePayload(input: string) {
  if (!input.trim()) {
    return {};
  }
  return JSON.parse(input) as Record<string, unknown>;
}

async function onSubmit() {
  const { valid } = await formApi.validate();
  if (!valid || !targetDevice.value?.id) {
    return;
  }
  drawerApi.lock();
  try {
    const values = await formApi.getValues<{
      commandType: string;
      payloadJson: string;
    }>();
    await requestDeviceCommandApi(targetDevice.value.id, {
      commandType: values.commandType.trim(),
      payload: parsePayload(values.payloadJson ?? '{}'),
    });
    await loadCommands();
    emit('success');
  } finally {
    drawerApi.unlock();
  }
}
</script>

<template>
  <Drawer :title="drawerTitle" class="w-[860px] max-w-full">
    <div class="space-y-4">
      <Form />
      <div class="space-y-2">
        <div class="text-sm font-medium">{{ $t('device.commandHistory') }}</div>
        <Spin :spinning="loading">
          <div class="space-y-3">
            <div
              v-for="item in commands"
              :key="item.id"
              class="rounded-md border border-border px-3 py-3"
            >
              <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div class="w-[100px] shrink-0 truncate font-medium">
                  {{ item.commandType }}
                </div>
                <div class="text-xs text-muted-foreground">
                  {{ getStatusLabel(item.status) }}
                </div>
              </div>
              <div class="mb-2 text-xs text-muted-foreground">
                {{ formatDateTime(item.requestedAt) }} / {{ item.requestedBy }}
              </div>
              <JsonViewer :value="item.payload ?? {}" boxed preview-mode copyable />
              <div v-if="item.failureReason" class="mt-2 text-xs text-destructive">
                {{ item.failureReason }}
              </div>
            </div>
            <div v-if="commands.length === 0" class="text-sm text-muted-foreground">
              {{ $t('device.noCommandHistory') }}
            </div>
          </div>
        </Spin>
      </div>
      <div class="flex justify-end">
        <Button @click="loadCommands">
          {{ $t('common.refresh') }}
        </Button>
      </div>
    </div>
  </Drawer>
</template>
