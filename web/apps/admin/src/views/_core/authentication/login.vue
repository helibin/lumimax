<script lang="ts" setup>
import type { VbenFormSchema } from '@lumimax/common-ui';

import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { AuthenticationLogin, z } from '@lumimax/common-ui';
import { $t } from '@lumimax/locales';

import { getInitStatusApi } from '#/api';
import { useAuthStore } from '#/store';

defineOptions({ name: 'Login' });

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

const formSchema = computed((): VbenFormSchema[] => {
  const presetUsername =
    typeof route.query.username === 'string' && route.query.username.trim()
      ? route.query.username.trim()
      : 'admin';
  return [
    {
      component: 'VbenInput',
      componentProps: {
        placeholder: $t('authentication.usernameTip'),
      },
      defaultValue: presetUsername,
      fieldName: 'username',
      label: $t('authentication.username'),
      rules: z.string().min(1, { message: $t('authentication.usernameTip') }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: $t('authentication.password'),
      },
      fieldName: 'password',
      label: $t('authentication.password'),
      rules: z.string().min(1, { message: $t('authentication.passwordTip') }),
    },
  ];
});

onMounted(async () => {
  try {
    const status = await getInitStatusApi();
    if (!status.initialized) {
      await router.replace('/setup');
    }
  } catch {
    // Keep login page available when init-status is temporarily unreachable.
  }
});
</script>

<template>
  <AuthenticationLogin
    :form-schema="formSchema"
    :loading="authStore.loginLoading"
    @submit="authStore.authLogin"
  />
</template>
