<script lang="ts" setup>
import type { VbenFormSchema } from '#/adapter/form';
import type { NotificationApi } from '#/api';

import { computed } from 'vue';

import { useVbenDrawer } from '@lumimax/common-ui';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { sendTestNotificationApi } from '#/api';
import { $t } from '#/locales';

import { getNotificationChannelOptions } from '../../data';

const emit = defineEmits<{
  success: [];
}>();

type TestFormValues = {
  channels?: NotificationApi.NotificationChannel[];
  eventName: string;
  payloadJson: string;
  templateCode: string;
  tenantId?: string;
  userId: string;
};

const schema: VbenFormSchema[] = [
  {
    component: 'Input',
    fieldName: 'userId',
    label: $t('notification.userId'),
    rules: 'required',
  },
  {
    component: 'Input',
    fieldName: 'tenantId',
    label: $t('notification.tenantId'),
  },
  {
    component: 'Input',
    fieldName: 'eventName',
    label: $t('notification.eventName'),
    rules: 'required',
  },
  {
    component: 'Input',
    fieldName: 'templateCode',
    label: $t('notification.templateCode'),
    rules: 'required',
  },
  {
    component: 'Select',
    componentProps: {
      allowClear: true,
      mode: 'multiple',
      options: getNotificationChannelOptions().map(({ label, value }) => ({
        label,
        value,
      })),
    },
    fieldName: 'channels',
    help: $t('notification.channelsHelp'),
    label: $t('notification.channels'),
  },
  {
    component: 'Textarea',
    componentProps: {
      rows: 8,
    },
    fieldName: 'payloadJson',
    help: $t('notification.payloadHelp'),
    label: $t('notification.payload'),
    rules: 'required',
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
    formApi.resetForm();
    formApi.setValues({
      channels: [],
      eventName: 'notification.test',
      payloadJson: '{\n  "title": "测试通知",\n  "content": "这是一条来自管理端的测试消息。"\n}',
      templateCode: 'notification_test',
      tenantId: '',
      userId: '',
    });
  },
});

const drawerTitle = computed(() => $t('notification.sendTest'));

function parsePayload(input: string) {
  return JSON.parse(input) as Record<string, unknown>;
}

async function onSubmit() {
  const { valid } = await formApi.validate();
  if (!valid) {
    return;
  }

  const values = await formApi.getValues<TestFormValues>();

  let payload: Record<string, unknown>;
  try {
    payload = parsePayload(values.payloadJson ?? '{}');
  } catch {
    message.error($t('notification.payloadInvalid'));
    return;
  }

  drawerApi.lock();
  try {
    await sendTestNotificationApi({
      ...(values.channels?.length ? { channels: values.channels } : {}),
      ...(values.tenantId?.trim() ? { tenantId: values.tenantId.trim() } : {}),
      eventName: values.eventName.trim(),
      payload,
      templateCode: values.templateCode.trim(),
      userId: values.userId.trim(),
    });
    drawerApi.close();
    emit('success');
  } finally {
    drawerApi.unlock();
  }
}
</script>

<template>
  <Drawer :title="drawerTitle" class="w-[720px] max-w-full">
    <Form />
  </Drawer>
</template>
