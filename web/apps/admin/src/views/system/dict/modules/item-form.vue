<script lang="ts" setup>
import type { VbenFormSchema } from '#/adapter/form';
import type { DictApi } from '#/api';

import { computed, ref } from 'vue';

import { useVbenDrawer } from '@lumimax/common-ui';

import { Button, message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { createDictItemApi, updateDictItemApi } from '#/api';
import { $t } from '#/locales';

type DictItemFormValues = {
  extraJson?: string;
  label: string;
  sort?: number;
  status?: 'active' | 'disabled';
  value: string;
};

const emit = defineEmits<{
  success: [];
}>();

const target = ref<DictApi.DictTypeItem | null>(null);
const formData = ref<DictApi.DictItem | null>(null);

const schema: VbenFormSchema[] = [
  {
    component: 'Input',
    fieldName: 'label',
    label: $t('system.dict.itemLabel'),
    rules: 'required',
  },
  {
    component: 'Input',
    fieldName: 'value',
    label: $t('system.dict.itemValue'),
    rules: 'required',
  },
  {
    component: 'InputNumber',
    defaultValue: 0,
    fieldName: 'sort',
    label: $t('system.dict.sortOrder'),
  },
  {
    component: 'RadioGroup',
    componentProps: {
      buttonStyle: 'solid',
      optionType: 'button',
      options: [
        { label: 'active', value: 'active' },
        { label: 'disabled', value: 'disabled' },
      ],
    },
    defaultValue: 'active',
    fieldName: 'status',
    label: $t('system.dict.status'),
  },
  {
    component: 'Textarea',
    componentProps: {
      rows: 6,
    },
    fieldName: 'extraJson',
    help: $t('device.metadataHelp'),
    label: 'Extra JSON',
  },
];

const [Form, formApi] = useVbenForm({
  schema,
  showDefaultActions: false,
});

const [Drawer, drawerApi] = useVbenDrawer({
  onOpenChange(isOpen) {
    if (!isOpen) {
      return;
    }
    const data = drawerApi.getData<
      | DictApi.DictTypeItem
      | {
          item?: DictApi.DictItem | null;
          target: DictApi.DictTypeItem;
        }
    >() as
      | DictApi.DictTypeItem
      | null
      | { item?: DictApi.DictItem | null; target?: DictApi.DictTypeItem };
    if (data && 'code' in data) {
      target.value = data;
      formData.value = null;
    } else {
      target.value = data?.target ?? null;
      formData.value = data?.item ?? null;
    }
    formApi.resetForm();
    if (!formData.value?.id) {
      formApi.setValues({
        extraJson: '{}',
        label: '',
        sort: 0,
        status: 'active',
        value: '',
      });
      return;
    }
    formApi.setValues({
      extraJson: formData.value.extra_json || '{}',
      label: formData.value.label,
      sort: formData.value.sort ?? 0,
      status: (formData.value.status as 'active' | 'disabled') ?? 'active',
      value: formData.value.value,
    });
  },
});

const drawerTitle = computed(() =>
  formData.value?.id
    ? `${$t('ui.actionTitle.edit', [$t('system.dict.items')])} - ${target.value?.name ?? ''}`
    : `${$t('ui.actionTitle.create', [$t('system.dict.items')])} - ${target.value?.name ?? ''}`,
);

function parseExtraJson(input: string | undefined): Record<string, unknown> {
  if (!input?.trim()) {
    return {};
  }
  return JSON.parse(input) as Record<string, unknown>;
}

async function onSubmit() {
  const { valid } = await formApi.validate();
  if (!valid || !target.value?.code) {
    return;
  }

  let extra: Record<string, unknown>;
  try {
    const draftValues = await formApi.getValues<DictItemFormValues>();
    extra = parseExtraJson(draftValues.extraJson);
  } catch {
    message.error($t('device.metadataInvalid'));
    return;
  }

  drawerApi.lock();
  try {
    const values = await formApi.getValues<DictItemFormValues>();
    const payload = {
      extra,
      label: values.label.trim(),
      sort: Number(values.sort ?? 0),
      status: values.status ?? 'active',
      value: values.value.trim(),
    } satisfies DictApi.CreateDictItemParams;
    await (formData.value?.id
      ? updateDictItemApi(formData.value.id, payload)
      : createDictItemApi(target.value.code, payload));
    drawerApi.close();
    emit('success');
  } finally {
    drawerApi.unlock();
  }
}
</script>

<template>
  <Drawer :footer="false" :title="drawerTitle" class="w-[720px] max-w-full">
    <div class="space-y-4">
      <Form />
      <div class="flex justify-end">
        <Button type="primary" @click="onSubmit">
          {{ $t('system.dict.submit') }}
        </Button>
      </div>
    </div>
  </Drawer>
</template>
