<script lang="ts" setup>
import type { Recordable } from '@lumimax/types';

import type { VbenFormSchema } from '#/adapter/form';
import type { MenuApi } from '#/api';

import { computed, nextTick, ref } from 'vue';

import { useVbenDrawer } from '@lumimax/common-ui';
import { getPopupContainer } from '@lumimax/utils';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { createMenuApi, getMenuTreeApi, updateMenuApi } from '#/api';
import { $t } from '#/locales';
import { componentKeys } from '#/router/routes';

import { getMenuTypeOptions } from '../data';

const emit = defineEmits<{
  success: [];
}>();

const formData = ref<MenuApi.MenuItem | null>(null);

const schema: VbenFormSchema[] = [
  {
    component: 'RadioGroup',
    componentProps: {
      buttonStyle: 'solid',
      options: getMenuTypeOptions(),
      optionType: 'button',
    },
    defaultValue: 'menu',
    fieldName: 'menuType',
    formItemClass: 'col-span-2 md:col-span-2',
    label: $t('system.menu.type'),
  },
  {
    component: 'Input',
    fieldName: 'name',
    label: $t('system.menu.menuName'),
    rules: 'required',
  },
  {
    component: 'Input',
    componentProps: {
      placeholder: 'system',
    },
    fieldName: 'code',
    help: $t('system.menu.menuCodeHelp'),
    label: $t('system.menu.menuCode'),
    rules: 'required',
  },
  {
    component: 'ApiTreeSelect',
    componentProps: {
      api: async () => await getMenuTreeApi(),
      class: 'w-full',
      childrenField: 'children',
      filterTreeNode(input: string, node: Recordable<any>) {
        if (!input) {
          return true;
        }
        const name = String(node.name ?? '');
        const code = String(node.code ?? '');
        return name.includes(input) || code.includes(input);
      },
      getPopupContainer,
      labelField: 'name',
      showSearch: true,
      treeDefaultExpandAll: true,
      valueField: 'id',
    },
    fieldName: 'parentId',
    label: $t('system.menu.parent'),
  },
  {
    component: 'Input',
    dependencies: {
      show: (values) => values.menuType !== 'button',
      triggerFields: ['menuType'],
    },
    componentProps: {
      placeholder: '/system/menu',
    },
    fieldName: 'routePath',
    help: $t('system.menu.routePathHelp'),
    label: $t('system.menu.path'),
  },
  {
    component: 'AutoComplete',
    componentProps: {
      allowClear: true,
      class: 'w-full',
      filterOption(input: string, option: { value: string }) {
        return option.value.toLowerCase().includes(input.toLowerCase());
      },
      options: componentKeys.map((item) => ({ value: item })),
      placeholder: '/system/menu/list',
    },
    dependencies: {
      show: (values) => values.menuType === 'menu' || values.menuType === 'catalog',
      triggerFields: ['menuType'],
    },
    fieldName: 'component',
    help: $t('system.menu.componentHelp'),
    label: $t('system.menu.component'),
  },
  {
    component: 'Input',
    fieldName: 'icon',
    label: $t('system.menu.icon'),
  },
  {
    component: 'Input',
    dependencies: {
      show: (values) => values.menuType === 'button' || values.menuType === 'menu',
      triggerFields: ['menuType'],
    },
    componentProps: {
      placeholder: 'system:menu:view',
    },
    fieldName: 'permissionCode',
    help: $t('system.menu.permissionCodeHelp'),
    label: $t('system.menu.permissionCode'),
  },
  {
    component: 'Input',
    dependencies: {
      show: (values) => values.menuType === 'external',
      triggerFields: ['menuType'],
    },
    componentProps: {
      placeholder: 'https://example.com',
    },
    fieldName: 'externalLink',
    label: $t('system.menu.externalLink'),
  },
  {
    component: 'InputNumber',
    fieldName: 'sort',
    label: $t('system.menu.sortNo'),
  },
  {
    component: 'Divider',
    fieldName: 'divider-meta',
    formItemClass: 'col-span-2 md:col-span-2 pb-0',
    hideLabel: true,
    renderComponentContent() {
      return {
        default: () => $t('system.menu.advancedSettings'),
      };
    },
  },
  {
    component: 'Checkbox',
    fieldName: 'visible',
    renderComponentContent() {
      return {
        default: () => $t('system.menu.visible'),
      };
    },
  },
  {
    component: 'Checkbox',
    dependencies: {
      show: (values) => values.menuType !== 'button',
      triggerFields: ['menuType'],
    },
    fieldName: 'keepAlive',
    renderComponentContent() {
      return {
        default: () => $t('system.menu.keepAlive'),
      };
    },
  },
  {
    component: 'Checkbox',
    fieldName: 'enabled',
    renderComponentContent() {
      return {
        default: () => $t('system.menu.enabled'),
      };
    },
  },
  {
    component: 'Textarea',
    componentProps: {
      rows: 6,
    },
    fieldName: 'extraJson',
    formItemClass: 'col-span-2 md:col-span-2',
    help: $t('system.menu.metaJsonHelp'),
    label: $t('system.menu.metaJson'),
  },
];

const [Form, formApi] = useVbenForm({
  commonConfig: {
    colon: true,
    formItemClass: 'col-span-2 md:col-span-1',
  },
  schema,
  showDefaultActions: false,
  wrapperClass: 'grid-cols-2 gap-x-4',
});

const [Drawer, drawerApi] = useVbenDrawer({
  onConfirm: onSubmit,
  async onOpenChange(isOpen) {
    if (!isOpen) {
      return;
    }

    const data = drawerApi.getData<MenuApi.MenuItem>() ?? null;
    formApi.resetForm();
    formData.value = data;

    await nextTick();

    if (!data?.id) {
      formApi.setValues({
        code: '',
        component: '',
        enabled: true,
        externalLink: '',
        extraJson: '',
        icon: '',
        keepAlive: false,
        menuType: 'menu',
        name: '',
        parentId: data?.parentId ?? null,
        permissionCode: '',
        routePath: '',
        sort: 0,
        visible: true,
      });
      return;
    }

    formApi.setValues({
      code: data.code,
      component: data.component ?? '',
      enabled: data.status === 'active',
      externalLink: data.externalLink ?? '',
      extraJson: JSON.stringify(data.extra ?? {}, null, 2),
      icon: data.icon ?? '',
      keepAlive: data.keepAlive,
      menuType: data.menuType,
      name: data.name,
      parentId: data.parentId,
      permissionCode: data.permissionCode ?? '',
      routePath: data.routePath ?? '',
      sort: data.sort,
      visible: data.visible,
    });
  },
});

function parseExtra(values: Record<string, any>) {
  const extraJson = values.extraJson;
  if (typeof extraJson !== 'string' || !extraJson.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(extraJson) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    message.error($t('system.menu.metaJsonInvalid'));
    throw new Error('extra json parse failed');
  }
}

async function onSubmit() {
  const { valid } = await formApi.validate();
  if (!valid) {
    return;
  }

  drawerApi.lock();
  try {
    const values = await formApi.getValues<Record<string, any>>();
    const payload: MenuApi.CreateMenuParams = {
      code: String(values.code ?? '').trim(),
      component: String(values.component ?? '').trim() || null,
      externalLink: String(values.externalLink ?? '').trim() || null,
      extra: parseExtra(values),
      icon: String(values.icon ?? '').trim() || null,
      keepAlive: Boolean(values.keepAlive),
      menuType: values.menuType as MenuApi.MenuType,
      name: String(values.name ?? '').trim(),
      parentId: values.parentId || null,
      permissionCode: String(values.permissionCode ?? '').trim() || null,
      routePath: String(values.routePath ?? '').trim() || null,
      sort: Number(values.sort ?? 0),
      status: values.enabled ? 'active' : 'disabled',
      visible: Boolean(values.visible),
    };

    await (formData.value?.id ? updateMenuApi(formData.value.id, payload) : createMenuApi(payload));

    drawerApi.close();
    emit('success');
  } finally {
    drawerApi.unlock();
  }
}

const getDrawerTitle = computed(() =>
  formData.value?.id
    ? $t('ui.actionTitle.edit', [$t('system.menu.name')])
    : $t('ui.actionTitle.create', [$t('system.menu.name')]),
);
</script>

<template>
  <Drawer class="w-full max-w-220" :title="getDrawerTitle">
    <Form class="mx-4" layout="vertical" />
  </Drawer>
</template>
