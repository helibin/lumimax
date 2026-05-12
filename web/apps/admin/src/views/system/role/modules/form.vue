<script lang="ts" setup>
import type { VbenFormSchema } from '#/adapter/form';
import type { MenuApi, RoleApi } from '#/api';

import { computed, nextTick, ref } from 'vue';

import { useVbenDrawer } from '@lumimax/common-ui';

import { Spin, Tree } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  assignRoleMenusApi,
  createRoleApi,
  getMenuTreeApi,
  getPermissionListApi,
  getRoleDetailApi,
  getRoleMenuIdsApi,
  updateRoleApi,
  updateRolePermissionsApi,
} from '#/api';
import { $t } from '#/locales';

import { useFormSchema } from '../data';

const emit = defineEmits<{
  success: [];
}>();

const formData = ref<null | RoleApi.RoleItem>(null);
const permissionTree = ref<RoleApi.PermissionItem[]>([]);
const menuTree = ref<MenuApi.MenuTreeItem[]>([]);
const checkedPermissionIds = ref<string[]>([]);
const checkedMenuIds = ref<string[]>([]);
const loadingMenus = ref(false);
const loadingPermissions = ref(false);

const schema: VbenFormSchema[] = useFormSchema();

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

    formData.value = drawerApi.getData<RoleApi.RoleItem>() ?? null;
    checkedPermissionIds.value = [];
    checkedMenuIds.value = [];
    formApi.resetForm();

    await Promise.all([ensurePermissionTreeLoaded(), ensureMenuTreeLoaded()]);
    await nextTick();

    if (formData.value) {
      const [detail, menuIds] = await Promise.all([
        getRoleDetailApi(formData.value.id),
        getRoleMenuIdsApi(formData.value.id),
      ]);
      formApi.setValues({
        code: detail.code,
        description: detail.description ?? '',
        name: detail.name,
      });
      checkedPermissionIds.value = (detail.permissions ?? []).map((item) => item.id);
      checkedMenuIds.value = menuIds;
    } else {
      formApi.setValues({
        code: '',
        description: '',
        name: '',
      });
    }
  },
});

const drawerTitle = computed(() =>
  formData.value?.id
    ? $t('ui.actionTitle.edit', [$t('system.role.name')])
    : $t('ui.actionTitle.create', [$t('system.role.name')]),
);

async function ensurePermissionTreeLoaded() {
  if (permissionTree.value.length > 0) {
    return;
  }

  loadingPermissions.value = true;
  try {
    const result = await getPermissionListApi();
    permissionTree.value = result.items ?? [];
  } finally {
    loadingPermissions.value = false;
  }
}

async function ensureMenuTreeLoaded() {
  if (menuTree.value.length > 0) {
    return;
  }

  loadingMenus.value = true;
  try {
    menuTree.value = await getMenuTreeApi();
  } finally {
    loadingMenus.value = false;
  }
}

function toTreeData(items: RoleApi.PermissionItem[]) {
  const groups = new Map<string, RoleApi.PermissionItem[]>();
  for (const item of items) {
    const key = item.groupCode || 'default';
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }

  return [...groups.entries()].map(([groupCode, permissions]) => ({
    children: permissions.map((item) => ({
      key: item.id,
      title: `${item.name} (${item.code})`,
    })),
    key: groupCode,
    title: groupCode,
  }));
}

function toMenuTreeData(items: MenuApi.MenuTreeItem[]): Array<{
  children: ReturnType<typeof toMenuTreeData>;
  disableCheckbox: boolean;
  key: string;
  title: string;
}> {
  return items.map((item) => ({
    children: toMenuTreeData(item.children ?? []),
    disableCheckbox: item.status !== 'active',
    key: item.id,
    title: `${item.name} (${item.code})`,
  }));
}

async function onSubmit() {
  const { valid } = await formApi.validate();
  if (!valid) {
    return;
  }

  drawerApi.lock();
  try {
    const values = await formApi.getValues<RoleApi.CreateRoleParams>();
    const trimmedCode = values.code.trim();
    const trimmedDescription = values.description?.trim() ?? '';
    const trimmedName = values.name.trim();

    const role = formData.value?.id
      ? await updateRoleApi(formData.value.id, {
          description: trimmedDescription,
          name: trimmedName,
        })
      : await createRoleApi({
          code: trimmedCode,
          description: trimmedDescription,
          name: trimmedName,
        });

    await updateRolePermissionsApi(role.id, {
      permissionIds: checkedPermissionIds.value,
    });
    await assignRoleMenusApi(role.id, {
      menuIds: checkedMenuIds.value,
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
    <div class="space-y-4">
      <Form />
      <div class="space-y-2">
        <div class="text-sm font-medium">
          {{ $t('system.role.permissions') }}
        </div>
        <Spin :spinning="loadingPermissions">
          <Tree
            v-model:checked-keys="checkedPermissionIds"
            checkable
            :tree-data="toTreeData(permissionTree)"
            default-expand-all
          />
        </Spin>
      </div>
      <div class="space-y-2">
        <div class="text-sm font-medium">
          {{ $t('system.role.menuPermissions') }}
        </div>
        <Spin :spinning="loadingMenus">
          <Tree
            v-model:checked-keys="checkedMenuIds"
            checkable
            :tree-data="toMenuTreeData(menuTree)"
            default-expand-all
          />
        </Spin>
      </div>
    </div>
  </Drawer>
</template>
