<script lang="ts" setup>
import type { VbenFormSchema } from '#/adapter/form';
import type { DictApi } from '#/api';

import { computed } from 'vue';

import { useVbenDrawer } from '@lumimax/common-ui';

import { Button } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { createDictTypeApi, updateDictTypeApi } from '#/api';
import { $t } from '#/locales';

type DictTypeFormValues = DictApi.CreateDictTypeParams;

const emit = defineEmits<{
  success: [];
}>();

let editingItem: DictApi.DictTypeItem | null = null;

const schema: VbenFormSchema[] = [
  {
    component: 'Input',
    fieldName: 'name',
    label: $t('system.dict.name'),
    rules: 'required',
  },
  {
    component: 'Input',
    fieldName: 'code',
    label: $t('system.dict.dictType'),
    rules: 'required',
  },
  {
    component: 'Textarea',
    componentProps: {
      rows: 4,
    },
    fieldName: 'description',
    label: $t('system.dict.description'),
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
    editingItem = drawerApi.getData<DictApi.DictTypeItem>() ?? null;
    formApi.resetForm();
    formApi.setValues({
      code: editingItem?.code ?? '',
      description: editingItem?.description ?? '',
      name: editingItem?.name ?? '',
    });
    formApi.updateSchema([
      {
        component: 'Input',
        componentProps: {
          disabled: Boolean(editingItem?.code),
        },
        fieldName: 'name',
        label: $t('system.dict.name'),
        rules: 'required',
      },
      {
        component: 'Input',
        componentProps: {
          disabled: Boolean(editingItem?.code),
        },
        fieldName: 'code',
        label: $t('system.dict.dictType'),
        rules: 'required',
      },
      {
        component: 'Textarea',
        componentProps: {
          rows: 4,
        },
        fieldName: 'description',
        label: $t('system.dict.description'),
      },
    ]);
  },
});

const drawerTitle = computed(() =>
  editingItem?.code
    ? $t('ui.actionTitle.edit', [$t('system.dict.name')])
    : $t('ui.actionTitle.create', [$t('system.dict.name')]),
);

async function onSubmit() {
  const { valid } = await formApi.validate();
  if (!valid) {
    return;
  }
  drawerApi.lock();
  try {
    const values = await formApi.getValues<DictTypeFormValues>();
    await (editingItem?.code
      ? updateDictTypeApi(editingItem.code, {
          description: values.description?.trim() || undefined,
          name: values.name.trim(),
        })
      : createDictTypeApi({
          code: values.code.trim(),
          description: values.description?.trim() || undefined,
          name: values.name.trim(),
        }));
    drawerApi.close();
    emit('success');
  } finally {
    drawerApi.unlock();
  }
}
</script>

<template>
  <Drawer :footer="false" :title="drawerTitle" class="w-[640px] max-w-full">
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
