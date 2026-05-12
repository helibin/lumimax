<script lang="ts" setup>
import { AuthenticationQrCodeLogin } from '@lumimax/common-ui';
import { LOGIN_PATH } from '@lumimax/constants';

defineOptions({ name: 'QrCodeLogin' });
</script>

<template>
  <AuthenticationQrCodeLogin :login-path="LOGIN_PATH" />
</template>
