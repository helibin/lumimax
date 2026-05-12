<script lang="ts" setup>
import type { VbenFormSchema } from '#/adapter/form';
import type { RoleApi, UserAdminApi } from '#/api';

import { computed, nextTick, ref } from 'vue';

import { useVbenDrawer } from '@lumimax/common-ui';

import { useVbenForm } from '#/adapter/form';
import { getRoleListApi, getUserDetailApi, resetUserPasswordApi, updateUserApi } from '#/api';
import { $t } from '#/locales';

import { useFormSchema } from '../data';

const emit = defineEmits<{
  success: [];
}>();

type UserFormValues = {
  email?: string;
  nickname: string;
  password?: string;
  phone?: string;
  roleIds?: string[];
  status: UserAdminApi.UserStatus;
  username: string;
};

const formData = ref<null | UserAdminApi.UserItem>(null);
const roleOptions = ref<RoleApi.RoleItem[]>([]);
const loadingRoles = ref(false);

const schema: VbenFormSchema[] = useFormSchema([]);

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
    formData.value = null;
    await ensureRoleOptionsLoaded();
    formApi.updateSchema(useFormSchema(roleOptions.value));

    const row = drawerApi.getData<UserAdminApi.UserItem>();
    if (!row?.id) {
      drawerApi.close();
      return;
    }

    const detail = await getUserDetailApi(row.id);
    formData.value = detail;
    const roleIds = roleOptions.value
      .filter((item) => detail.roles.includes(item.name))
      .map((item) => item.id);

    await nextTick();
    formApi.setValues({
      email: detail.email,
      nickname: detail.nickname,
      password: '',
      phone: detail.phone,
      roleIds,
      status: detail.status,
      username: detail.username,
    });
  },
});

const drawerTitle = computed(() => $t('ui.actionTitle.edit', [$t('system.user.name')]));

async function ensureRoleOptionsLoaded() {
  if (roleOptions.value.length > 0) {
    return;
  }
  loadingRoles.value = true;
  try {
    const result = await getRoleListApi({ page: 1, pageSize: 100 });
    roleOptions.value = result.items;
  } finally {
    loadingRoles.value = false;
  }
}

async function onSubmit() {
  const { valid } = await formApi.validate();
  if (!valid) {
    return;
  }

  const values = await formApi.getValues<UserFormValues>();
  if (!formData.value?.id) return;

  drawerApi.lock();
  try {
    const basePayload = {
      email: values.email?.trim() ?? '',
      nickname: values.nickname.trim(),
      phone: values.phone?.trim() ?? '',
      roleIds: values.roleIds ?? [],
    };

    const savedUser = await updateUserApi(formData.value.id, {
      ...basePayload,
    });

    if (formData.value?.id && values.password?.trim()) {
      await resetUserPasswordApi(savedUser.id, {
        newPassword: values.password.trim(),
      });
    }

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
