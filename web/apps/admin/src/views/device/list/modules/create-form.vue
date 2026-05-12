<script lang="ts" setup>
import type { VbenFormSchema } from '#/adapter/form';

import { useVbenDrawer } from '@lumimax/common-ui';

import { useVbenForm } from '#/adapter/form';
import { createDeviceApi } from '#/api';
import { $t } from '#/locales';

type CreateDeviceFormValues = {
  deviceType?: string;
  firmwareVersion?: string;
  market?: string;
  metadataJson?: string;
  name: string;
  productCode?: string;
  sn?: string;
};

const emit = defineEmits<{
  success: [];
}>();

const DEFAULT_MARKET = 'US';

const schema: VbenFormSchema[] = [
  {
    component: 'Input',
    fieldName: 'name',
    label: $t('device.name'),
    rules: 'required',
  },
  {
    component: 'Input',
    fieldName: 'sn',
    label: $t('device.sn'),
    rules: 'required',
  },
  {
    component: 'Input',
    defaultValue: 'smart-scale',
    fieldName: 'deviceType',
    label: $t('device.type'),
  },
  {
    component: 'Input',
    fieldName: 'productCode',
    label: $t('device.productCode'),
  },
  {
    component: 'Input',
    fieldName: 'firmwareVersion',
    label: $t('device.firmwareVersion'),
  },
  {
    component: 'Input',
    componentProps: {
      disabled: true,
    },
    defaultValue: DEFAULT_MARKET,
    fieldName: 'market',
    help: $t('device.marketHelp'),
    label: $t('device.market'),
  },
  {
    component: 'Textarea',
    componentProps: {
      rows: 5,
    },
    fieldName: 'metadataJson',
    help: $t('device.metadataHelp'),
    label: $t('device.metadata'),
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
    formApi.resetForm();
    formApi.setValues({
      deviceType: 'smart-scale',
      firmwareVersion: '',
      market: DEFAULT_MARKET,
      metadataJson: '',
      name: '',
      productCode: '',
      sn: '',
    });
  },
});

async function onSubmit() {
  const { valid } = await formApi.validate();
  if (!valid) {
    return;
  }
  drawerApi.lock();
  try {
    const values = await formApi.getValues<CreateDeviceFormValues>();
    const name = values.name.trim();
    const sn = values.sn?.trim();
    const deviceSn = sn || name;
    const productCode = values.productCode?.trim();
    const deviceType = values.deviceType?.trim();

    await createDeviceApi({
      deviceSn,
      deviceType: deviceType || undefined,
      name,
      onlineStatus: 'offline',
      productKey: productCode || deviceType || undefined,
      status: 'active',
    });
    drawerApi.close();
    emit('success');
  } finally {
    drawerApi.unlock();
  }
}
</script>

<template>
  <Drawer :title="$t('ui.actionTitle.create', [$t('device.name')])">
    <Form />
  </Drawer>
</template>
