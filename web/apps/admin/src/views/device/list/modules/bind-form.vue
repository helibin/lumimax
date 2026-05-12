<script lang="ts" setup>
import type { VbenFormSchema } from '#/adapter/form';
import type { DeviceApi } from '#/api';

import { computed, ref } from 'vue';

import { useVbenDrawer } from '@lumimax/common-ui';

import { useVbenForm } from '#/adapter/form';
import { bindDeviceApi } from '#/api';
import { $t } from '#/locales';

const emit = defineEmits<{
  success: [];
}>();

const targetDevice = ref<DeviceApi.DeviceItem | null>(null);

const schema: VbenFormSchema[] = [
  {
    component: 'Input',
    fieldName: 'userId',
    label: $t('device.ownerUserId'),
  },
  {
    component: 'Input',
    fieldName: 'tenantId',
    label: $t('device.tenantId'),
  },
];

const [Form, formApi] = useVbenForm({
  schema,
  showDefaultActions: false,
});

const [Drawer, drawerApi] = useVbenDrawer({
  onConfirm: onSubmit,
  onOpenChange(isOpen) {
    if (!isOpen) {
      return;
    }
    targetDevice.value = drawerApi.getData<DeviceApi.DeviceItem>() ?? null;
    formApi.resetForm();
    formApi.setValues({
      tenantId: targetDevice.value?.tenantId ?? '',
      userId: targetDevice.value?.ownerUserId ?? '',
    });
  },
});

const drawerTitle = computed(() => `${$t('device.bind')} - ${targetDevice.value?.name ?? ''}`);

function normalizeValue(value?: string) {
  return value && value.trim() ? value.trim() : null;
}

async function onSubmit() {
  const { valid } = await formApi.validate();
  if (!valid || !targetDevice.value?.id) {
    return;
  }
  drawerApi.lock();
  try {
    const values = await formApi.getValues<{
      tenantId?: string;
      userId?: string;
    }>();
    await bindDeviceApi(targetDevice.value.id, {
      tenantId: normalizeValue(values.tenantId),
      userId: normalizeValue(values.userId),
    });
    drawerApi.close();
    emit('success');
  } finally {
    drawerApi.unlock();
  }
}
</script>

<template>
  <Drawer :title="drawerTitle">
    <Form />
  </Drawer>
</template>
