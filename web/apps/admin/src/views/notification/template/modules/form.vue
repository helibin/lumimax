<script lang="ts" setup>
import type { VbenFormSchema } from '#/adapter/form';
import type { NotificationApi } from '#/api';

import { computed, ref } from 'vue';

import { useVbenDrawer } from '@lumimax/common-ui';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { createNotificationTemplateApi, updateNotificationTemplateApi } from '#/api';
import { $t } from '#/locales';

import { getNotificationChannelOptions } from '../../data';

const emit = defineEmits<{
  success: [];
}>();

type TemplateFormValues = {
  channel: NotificationApi.NotificationChannel;
  code: string;
  contentTemplate: string;
  isEnabled: boolean;
  locale: string;
  titleTemplate: string;
  variablesSchemaJson: string;
};

const formData = ref<NotificationApi.NotificationTemplateItem | null>(null);

function getSchema(isEdit: boolean): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      componentProps: {
        disabled: isEdit,
      },
      fieldName: 'code',
      label: $t('notification.templateCode'),
      rules: 'required',
    },
    {
      component: 'Select',
      componentProps: {
        disabled: isEdit,
        options: getNotificationChannelOptions().map(({ label, value }) => ({
          label,
          value,
        })),
      },
      fieldName: 'channel',
      label: $t('notification.channel'),
      rules: 'required',
    },
    {
      component: 'Input',
      componentProps: {
        disabled: isEdit,
      },
      fieldName: 'locale',
      label: $t('notification.locale'),
      rules: 'required',
    },
    {
      component: 'Checkbox',
      fieldName: 'isEnabled',
      renderComponentContent() {
        return {
          default: () => $t('notification.isEnabled'),
        };
      },
    },
    {
      component: 'Input',
      fieldName: 'titleTemplate',
      label: $t('notification.titleTemplate'),
      rules: 'required',
    },
    {
      component: 'Textarea',
      componentProps: {
        rows: 8,
      },
      fieldName: 'contentTemplate',
      label: $t('notification.contentTemplate'),
      rules: 'required',
    },
    {
      component: 'Textarea',
      componentProps: {
        rows: 6,
      },
      fieldName: 'variablesSchemaJson',
      help: $t('notification.variablesSchemaHelp'),
      label: $t('notification.variablesSchema'),
    },
  ];
}

const [Form, formApi] = useVbenForm({
  schema: getSchema(false),
  showDefaultActions: false,
});

const [Drawer, drawerApi] = useVbenDrawer({
  onConfirm: onSubmit,
  async onOpenChange(isOpen) {
    if (!isOpen) {
      return;
    }

    formData.value = drawerApi.getData<NotificationApi.NotificationTemplateItem>() ?? null;
    formApi.resetForm();
    formApi.updateSchema(getSchema(Boolean(formData.value?.id)));

    if (!formData.value?.id) {
      formApi.setValues({
        channel: 'realtime',
        code: '',
        contentTemplate: '',
        isEnabled: true,
        locale: 'zh-CN',
        titleTemplate: '',
        variablesSchemaJson: '{}',
      });
      return;
    }

    formApi.setValues({
      ...formData.value,
      id: formData.value.id,
      variablesSchemaJson: JSON.stringify(formData.value.variablesSchema ?? {}, null, 2),
    });
  },
});

const drawerTitle = computed(() =>
  formData.value?.id
    ? $t('ui.actionTitle.edit', [$t('notification.templateName')])
    : $t('ui.actionTitle.create', [$t('notification.templateName')]),
);

function parseVariablesSchema(input: string) {
  if (!input.trim()) {
    return {};
  }
  return JSON.parse(input) as Record<string, unknown>;
}

async function onSubmit() {
  const { valid } = await formApi.validate();
  if (!valid) {
    return;
  }

  const values = await formApi.getValues<TemplateFormValues>();

  let variablesSchema: Record<string, unknown>;
  try {
    variablesSchema = parseVariablesSchema(values.variablesSchemaJson ?? '{}');
  } catch {
    message.error($t('notification.variablesSchemaInvalid'));
    return;
  }

  drawerApi.lock();
  try {
    await (formData.value?.id
      ? updateNotificationTemplateApi(formData.value.id, {
          contentTemplate: values.contentTemplate.trim(),
          isEnabled: values.isEnabled === true,
          titleTemplate: values.titleTemplate.trim(),
          variablesSchema,
        })
      : createNotificationTemplateApi({
          channel: values.channel,
          code: values.code.trim(),
          contentTemplate: values.contentTemplate.trim(),
          isEnabled: values.isEnabled === true,
          locale: values.locale.trim(),
          titleTemplate: values.titleTemplate.trim(),
          variablesSchema,
        }));

    drawerApi.close();
    emit('success');
  } finally {
    drawerApi.unlock();
  }
}
</script>

<template>
  <Drawer :title="drawerTitle" class="w-[760px] max-w-full">
    <Form />
  </Drawer>
</template>
