<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@lumimax/icons';
import { Alert, Button, Card, Descriptions, Radio, Result, message } from 'ant-design-vue';

import type { VbenFormSchema } from '#/adapter/form';
import { getCachedInitStatusApi, getInitStatusApi, initializeSystemApi } from '#/api';
import { useVbenForm, z } from '#/adapter/form';
import { $t } from '#/locales';

defineOptions({ name: 'SystemInitialize' });

interface InitStatus {
  databaseReady: boolean;
  initialized: boolean;
  initializedAt: null | string;
  seedMode: string;
  usageMode: string;
  warnings: string[];
}

const router = useRouter();

const loading = ref(false);
const submitLoading = ref(false);
const currentStep = ref(0);
const initStatus = ref<InitStatus | null>(null);
const loadError = ref('');

const form = ref({
  email: '',
  nickname: $t('init.setup.adminStep.nicknamePlaceholder'),
  password: '',
  passwordConfirm: '',
  usageMode: 'default',
  username: 'admin',
});

const adminFormSchema = computed((): VbenFormSchema[] => [
  {
    component: 'Input',
    componentProps: {
      placeholder: $t('init.setup.adminStep.usernamePlaceholder'),
    },
    defaultValue: form.value.username,
    fieldName: 'username',
    label: $t('init.setup.adminStep.username'),
    rules: z.string().min(1, { message: $t('init.setup.messages.completeRequired') }),
  },
  {
    component: 'Input',
    componentProps: {
      placeholder: $t('init.setup.adminStep.nicknamePlaceholder'),
    },
    defaultValue: form.value.nickname,
    fieldName: 'nickname',
    label: $t('init.setup.adminStep.nickname'),
    rules: z.string().min(1, { message: $t('init.setup.messages.completeRequired') }),
  },
  {
    component: 'InputPassword',
    componentProps: {
      placeholder: $t('init.setup.adminStep.passwordPlaceholder'),
    },
    defaultValue: form.value.password,
    fieldName: 'password',
    label: $t('init.setup.adminStep.password'),
    rules: z.string().min(1, { message: $t('init.setup.messages.completeRequired') }),
  },
  {
    component: 'InputPassword',
    componentProps: {
      placeholder: $t('init.setup.adminStep.confirmPasswordPlaceholder'),
    },
    defaultValue: form.value.passwordConfirm,
    fieldName: 'passwordConfirm',
    label: $t('init.setup.adminStep.confirmPassword'),
    rules: z.string().min(1, { message: $t('init.setup.messages.completeRequired') }),
  },
  {
    component: 'Input',
    componentProps: {
      placeholder: $t('init.setup.adminStep.emailPlaceholder'),
    },
    defaultValue: form.value.email,
    fieldName: 'email',
    formItemClass: 'col-span-2 md:col-span-2',
    label: $t('init.setup.adminStep.email'),
  },
]);

const [AdminForm, adminFormApi] = useVbenForm(
  reactive({
    commonConfig: {
      colon: true,
      formItemClass: 'col-span-2 md:col-span-1',
    },
    handleValuesChange(values: Record<string, unknown>) {
      form.value.username = String(values.username ?? '');
      form.value.nickname = String(values.nickname ?? '');
      form.value.password = String(values.password ?? '');
      form.value.passwordConfirm = String(values.passwordConfirm ?? '');
      form.value.email = String(values.email ?? '');
    },
    schema: adminFormSchema,
    showDefaultActions: false,
    wrapperClass: 'grid-cols-2 gap-x-4',
  }),
);

const stepItems = computed(() => [
  {
    key: 'database',
    title: $t('init.setup.databaseStep.title'),
    description: $t('init.setup.databaseStep.description'),
    icon: 'lucide:database',
  },
  {
    key: 'admin',
    title: $t('init.setup.adminStep.title'),
    description: $t('init.setup.adminStep.description'),
    icon: 'lucide:user-round',
  },
  {
    key: 'mode',
    title: $t('init.setup.modeStep.title'),
    description: $t('init.setup.modeStep.description'),
    icon: 'lucide:settings-2',
  },
  {
    key: 'complete',
    title: $t('init.setup.confirmStep.title'),
    description: $t('init.setup.confirmStep.description'),
    icon: 'lucide:circle-check-big',
  },
]);

const summaryItems = computed(() => [
  { label: $t('init.setup.summary.seedStrategy'), value: seedModeText.value },
  { label: $t('init.setup.summary.adminAccount'), value: form.value.username || '-' },
  { label: $t('init.setup.summary.adminNickname'), value: form.value.nickname || '-' },
  {
    label: $t('init.setup.summary.usageMode'),
    value:
      form.value.usageMode === 'demo'
        ? $t('init.setup.summary.demoMode')
        : $t('init.setup.summary.defaultMode'),
  },
]);

const seedModeText = computed(() => {
  const mode = initStatus.value?.seedMode;
  return mode ? $t(`init.setup.seedMode.${mode}`) : '-';
});

const confirmationNotes = computed(() => [
  $t('init.setup.confirmation.applySeedMode', [seedModeText.value]),
  $t('init.setup.confirmation.setAdmin'),
  $t('init.setup.confirmation.persistFlag'),
  $t('init.setup.confirmation.excludeDemo'),
]);

const hasWarnings = computed(() => (initStatus.value?.warnings?.length ?? 0) > 0);

const canMoveNext = computed(() => {
  if (currentStep.value === 0) {
    return Boolean(initStatus.value?.databaseReady);
  }
  if (currentStep.value === 1) {
    return (
      form.value.username.trim().length > 0
      && form.value.nickname.trim().length > 0
      && form.value.password.trim().length > 0
      && form.value.password === form.value.passwordConfirm
    );
  }
  return true;
});

const currentModeDescription = computed(() =>
  form.value.usageMode === 'demo'
    ? $t('init.setup.modeStep.demoInfo')
    : $t('init.setup.modeStep.defaultInfo'),
);

async function loadStatus() {
  loading.value = true;
  loadError.value = '';
  try {
    const status = getCachedInitStatusApi() ?? await getInitStatusApi();
    initStatus.value = status;
    if (status.initialized) {
      message.info($t('init.setup.alreadyInitialized'));
      await router.replace('/auth/login');
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : $t('init.setup.loadFailed');
  } finally {
    loading.value = false;
  }
}

function nextStep() {
  if (!canMoveNext.value) {
    if (currentStep.value === 0) {
      message.warning($t('init.setup.messages.databaseNotReady'));
      return;
    }
    if (currentStep.value === 1) {
      void validateAdminStep();
      return;
    }
    message.warning($t('init.setup.messages.completeRequired'));
    return;
  }
  if (currentStep.value === 1) {
    void validateAdminStep();
    return;
  }
  currentStep.value = Math.min(currentStep.value + 1, stepItems.value.length - 1);
}

function previousStep() {
  currentStep.value = Math.max(currentStep.value - 1, 0);
}

async function submitInitialization() {
  if (submitLoading.value) {
    return;
  }
  submitLoading.value = true;
  try {
    await initializeSystemApi({
      email: form.value.email.trim() || undefined,
      nickname: form.value.nickname.trim(),
      password: form.value.password,
      usageMode: form.value.usageMode,
      username: form.value.username.trim(),
    });
    message.success($t('init.setup.messages.initializeSuccess'));
    await router.replace({
      path: '/auth/login',
      query: { username: form.value.username.trim() },
    });
  } catch (error) {
    const text = error instanceof Error ? error.message : $t('init.setup.messages.initializeFailed');
    message.error(text);
  } finally {
    submitLoading.value = false;
  }
}

async function validateAdminStep() {
  const { valid } = await adminFormApi.validate();
  if (!valid) {
    return;
  }
  const values = await adminFormApi.getValues<Record<string, string>>();
  form.value.username = String(values.username ?? '').trim();
  form.value.nickname = String(values.nickname ?? '').trim();
  form.value.password = String(values.password ?? '');
  form.value.passwordConfirm = String(values.passwordConfirm ?? '');
  form.value.email = String(values.email ?? '').trim();

  if (form.value.password !== form.value.passwordConfirm) {
    message.warning($t('init.setup.messages.passwordMismatch'));
    return;
  }
  currentStep.value = Math.min(currentStep.value + 1, stepItems.value.length - 1);
}

onMounted(loadStatus);
</script>

<template>
  <div class="init-page">
    <div class="init-shell">
      <div class="init-header">
        <h1>{{ $t('init.setup.title') }}</h1>
        <p>{{ $t('init.setup.subtitle') }}</p>
      </div>

      <div class="init-progress">
        <template v-for="(item, index) in stepItems" :key="item.key">
          <div :class="['progress-item', { active: index === currentStep, done: index < currentStep }]">
            <div class="progress-head">
              <div class="progress-badge">
                <IconifyIcon v-if="index < currentStep" :icon="item.icon" />
                <span v-else>{{ index + 1 }}</span>
              </div>
            </div>
            <div class="progress-copy">
              <div class="progress-title">
                <span>{{ item.title }}</span>
              </div>
            </div>
          </div>
          <div v-if="index < stepItems.length - 1" class="progress-arrow" aria-hidden="true">
            <span class="progress-arrow-glyph">&gt;&gt;&gt;</span>
          </div>
        </template>
      </div>

      <Card :bordered="false" class="init-card" :loading="loading">
        <div class="init-body">
          <template v-if="loadError">
            <Result status="error" :title="$t('init.setup.loadFailed')" :sub-title="loadError">
              <template #extra>
                <Button type="primary" @click="loadStatus">
                  <template #icon>
                    <IconifyIcon icon="lucide:rotate-cw" />
                  </template>
                  {{ $t('init.setup.buttons.retry') }}
                </Button>
              </template>
            </Result>
          </template>

          <template v-else-if="currentStep === 0">
            <div class="body-header">
              <div class="body-icon success">
                <IconifyIcon icon="lucide:database" />
              </div>
              <h2>{{ $t('init.setup.databaseStep.heading') }}</h2>
              <p>{{ $t('init.setup.databaseStep.body', [$t('init.setup.databaseStep.database')]) }}</p>
            </div>

            <div class="info-grid">
              <div class="info-tile">
                <div class="info-label">{{ $t('init.setup.databaseStep.connectionStatus') }}</div>
                <div class="info-value success-text">
                  {{
                    initStatus?.databaseReady
                      ? $t('init.setup.databaseStep.ready')
                      : $t('init.setup.databaseStep.unavailable')
                  }}
                </div>
              </div>
              <div class="info-tile">
                <div class="info-label">{{ $t('init.setup.databaseStep.lastInitialized') }}</div>
                <div class="info-value">{{ initStatus?.initializedAt ?? $t('init.setup.databaseStep.notInitialized') }}</div>
              </div>
              <div class="info-tile">
                <div class="info-label">{{ $t('init.setup.databaseStep.seedStrategy') }}</div>
                <div class="info-value">{{ seedModeText }}</div>
              </div>
            </div>

            <Alert
              type="info"
              show-icon
              :message="$t('init.setup.databaseStep.info')"
            />
            <Alert
              v-if="hasWarnings"
              class="status-alert"
              type="warning"
              show-icon
              :message="initStatus?.warnings.join('；')"
            />
          </template>

          <template v-else-if="currentStep === 1">
            <div class="body-header compact">
              <div class="body-icon">
                <IconifyIcon icon="lucide:user-round" />
              </div>
              <h2>{{ $t('init.setup.adminStep.heading') }}</h2>
              <p>{{ $t('init.setup.adminStep.body') }}</p>
            </div>

            <div class="init-form">
              <AdminForm />
            </div>

          </template>

          <template v-else-if="currentStep === 2">
            <div class="body-header compact">
              <div class="body-icon">
                <IconifyIcon icon="lucide:settings-2" />
              </div>
              <h2>{{ $t('init.setup.modeStep.heading') }}</h2>
              <p>{{ $t('init.setup.modeStep.body') }}</p>
            </div>

            <Radio.Group v-model:value="form.usageMode" class="mode-grid">
              <label class="mode-card">
                <Radio value="default" />
                <div class="mode-copy">
                  <div class="mode-title">{{ $t('init.setup.modeStep.defaultTitle') }}</div>
                  <div class="mode-desc">{{ $t('init.setup.modeStep.defaultDesc') }}</div>
                </div>
              </label>
              <label class="mode-card">
                <Radio value="demo" />
                <div class="mode-copy">
                  <div class="mode-title">{{ $t('init.setup.modeStep.demoTitle') }}</div>
                  <div class="mode-desc">{{ $t('init.setup.modeStep.demoDesc') }}</div>
                </div>
              </label>
            </Radio.Group>

            <Alert type="info" show-icon :message="currentModeDescription" />
          </template>

          <template v-else>
            <div class="body-header">
              <div class="body-icon success">
                <IconifyIcon icon="lucide:circle-check-big" />
              </div>
              <h2>{{ $t('init.setup.confirmStep.heading') }}</h2>
              <p>{{ $t('init.setup.confirmStep.body') }}</p>
            </div>

            <div class="confirm-grid">
              <Descriptions :column="1" bordered size="small" class="summary-card">
                <Descriptions.Item v-for="item in summaryItems" :key="item.label" :label="item.label">
                  {{ item.value }}
                </Descriptions.Item>
              </Descriptions>

              <div class="confirm-card">
                <div class="confirm-title">{{ $t('init.setup.confirmStep.actionsTitle') }}</div>
                <ul class="confirm-list">
                  <li v-for="item in confirmationNotes" :key="item">{{ item }}</li>
                </ul>
              </div>

            </div>

            <Alert
              v-if="hasWarnings"
              class="status-alert"
              type="warning"
              show-icon
              :message="$t('init.setup.status.warnings')"
              :description="initStatus?.warnings.join('；')"
            />
          </template>
        </div>

        <div class="init-footer">
          <Button v-if="currentStep > 0" class="footer-button footer-button-secondary" @click="previousStep">
            <template #icon>
              <IconifyIcon icon="lucide:chevron-left" />
            </template>
            {{ $t('init.setup.buttons.previous') }}
          </Button>
          <div class="footer-spacer" v-else />
          <Button
            v-if="currentStep < stepItems.length - 1"
            type="primary"
            class="footer-button footer-button-primary"
            @click="nextStep"
          >
            {{ $t('init.setup.buttons.next') }}
            <template #icon>
              <IconifyIcon icon="lucide:chevron-right" />
            </template>
          </Button>
          <Button
            v-else
            type="primary"
            class="footer-button footer-button-primary"
            :loading="submitLoading"
            @click="submitInitialization"
          >
            <template #icon>
              <IconifyIcon icon="lucide:rocket" />
            </template>
            {{ $t('init.setup.buttons.initialize') }}
          </Button>
        </div>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.init-page {
  width: 100%;
  min-height: 100vh;
  padding: 24px 32px;
}

.init-shell {
  display: flex;
  flex-direction: column;
  width: min(100%, 1480px);
  margin: 0 auto;
  min-height: calc(100vh - 48px);
}

.init-shell :deep(.ant-card-body) {
  display: flex;
  flex: 1;
  flex-direction: column;
}

.init-header {
  margin-bottom: 24px;
}

.init-header h1 {
  margin: 0;
  font-size: 36px;
}

.init-header p {
  margin: 10px 0 0;
  color: rgb(255 255 255 / 65%);
  font-size: 18px;
}

.init-progress {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) 32px minmax(140px, 1fr) 32px minmax(140px, 1fr) 32px minmax(140px, 1fr);
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.progress-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 58px;
  padding: 10px 12px;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 10px;
  background: rgb(255 255 255 / 1.5%);
  overflow: hidden;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    transform 0.2s ease;
}

.progress-head {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  flex: 0 0 32px;
}

.progress-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: rgb(255 255 255 / 10%);
  color: rgb(255 255 255 / 72%);
  flex: 0 0 auto;
  font-size: 14px;
  font-weight: 700;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 6%);
}

.progress-item.done .progress-badge,
.progress-item.active .progress-badge {
  background: #1677ff;
  color: #fff;
  box-shadow: 0 12px 24px rgb(22 119 255 / 24%);
}

.progress-item.active {
  border-color: rgb(22 119 255 / 38%);
  background: rgb(22 119 255 / 8%);
  transform: translateY(-1px);
}

.progress-item.done {
  border-color: rgb(82 196 26 / 20%);
}

.progress-item.done::after,
.progress-item.active::after {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, #1677ff 0%, #69b1ff 100%);
  content: '';
}

.progress-copy {
  min-width: 0;
  width: 100%;
}

.progress-title {
  display: inline-flex;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
}

.progress-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgb(105 177 255 / 88%);
}

.progress-arrow-glyph {
  display: inline-block;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: inherit;
  opacity: 0.66;
}

.init-card {
  display: flex;
  flex: 1;
  flex-direction: column;
  border-radius: 16px;
}

.init-body {
  flex: 1;
  min-height: 420px;
}

.body-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 28px;
  text-align: center;
}

.body-header.compact {
  align-items: flex-start;
  text-align: left;
}

.body-header h2 {
  margin: 0 0 8px;
  font-size: 30px;
}

.body-header p {
  margin: 0;
  color: rgb(255 255 255 / 65%);
  font-size: 17px;
}

.body-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
  border-radius: 999px;
  background: rgb(22 119 255 / 14%);
  color: #69b1ff;
  font-size: 28px;
}

.body-icon.success {
  background: rgb(82 196 26 / 16%);
  color: #73d13d;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.info-tile,
.confirm-card {
  padding: 18px 20px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 12px;
  background: rgb(255 255 255 / 2%);
}

.info-label {
  margin-bottom: 8px;
  color: rgb(255 255 255 / 55%);
  font-size: 14px;
}

.info-value {
  font-size: 18px;
  font-weight: 600;
}

.success-text {
  color: #73d13d;
}

.mode-grid {
  display: grid;
  gap: 16px;
  margin-bottom: 20px;
}

.mode-card {
  display: flex;
  gap: 12px;
  padding: 18px 20px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 12px;
  background: rgb(255 255 255 / 2%);
  cursor: pointer;
}

.mode-copy {
  min-width: 0;
}

.mode-title {
  font-size: 17px;
  font-weight: 600;
}

.mode-desc {
  margin-top: 6px;
  color: rgb(255 255 255 / 60%);
  line-height: 1.5;
}

.init-form {
  display: block;
}

.init-form :deep(.ant-form-item-label > label) {
  color: rgb(255 255 255 / 82%);
  font-size: 14px;
  font-weight: 500;
}

.init-form :deep(.ant-form-item) {
  margin-bottom: 18px;
}

.init-form :deep(.ant-input),
.init-form :deep(.ant-input-password) {
  height: 44px;
  border-color: rgb(255 255 255 / 12%);
  border-radius: 10px;
  background: rgb(255 255 255 / 4%);
  color: #fff;
}

.init-form :deep(.ant-input-password .ant-input) {
  height: 42px;
  background: transparent;
  color: #fff;
}

.init-form :deep(.ant-input::placeholder),
.init-form :deep(.ant-input-password input::placeholder) {
  color: rgb(255 255 255 / 34%);
}

.init-form :deep(.ant-input:hover),
.init-form :deep(.ant-input:focus),
.init-form :deep(.ant-input-password:hover),
.init-form :deep(.ant-input-password-focused) {
  border-color: rgb(64 150 255 / 72%);
  background: rgb(255 255 255 / 6%);
  box-shadow: 0 0 0 2px rgb(22 119 255 / 12%);
}

.init-form :deep(.ant-input-password-icon) {
  color: rgb(255 255 255 / 45%);
}

.confirm-grid {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 16px;
}

.summary-card {
  border-radius: 12px;
  overflow: hidden;
}

.confirm-title {
  margin-bottom: 12px;
  font-size: 18px;
  font-weight: 600;
}

.confirm-list {
  margin: 0;
  padding-left: 18px;
  color: rgb(255 255 255 / 75%);
}

.confirm-list li + li {
  margin-top: 10px;
}

.init-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 24px;
}

.init-footer :deep(.footer-button) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 132px;
  height: 44px;
  padding: 0 20px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  box-shadow: none;
  cursor: pointer;
}

.init-footer :deep(.footer-button .anticon),
.init-footer :deep(.footer-button svg) {
  font-size: 16px;
}

.init-footer :deep(.footer-button-secondary) {
  border-color: rgb(255 255 255 / 16%);
  background: rgb(255 255 255 / 4%);
  color: rgb(255 255 255 / 88%);
}

.init-footer :deep(.footer-button-secondary:hover),
.init-footer :deep(.footer-button-secondary:focus) {
  border-color: rgb(255 255 255 / 28%);
  background: rgb(255 255 255 / 8%);
  color: #fff;
}

.init-footer :deep(.footer-button-primary) {
  border: none;
  background: linear-gradient(135deg, #1677ff 0%, #4096ff 100%);
  box-shadow: 0 12px 32px rgb(22 119 255 / 28%);
}

.init-footer :deep(.footer-button-primary:hover),
.init-footer :deep(.footer-button-primary:focus) {
  background: linear-gradient(135deg, #4096ff 0%, #69b1ff 100%);
  box-shadow: 0 16px 36px rgb(22 119 255 / 34%);
}

.init-footer :deep(.footer-button-primary.ant-btn-disabled),
.init-footer :deep(.footer-button-secondary.ant-btn-disabled),
.init-footer :deep(.footer-button-primary.ant-btn-loading) {
  box-shadow: none;
  cursor: not-allowed;
}

.status-alert {
  margin-top: 16px;
}

.footer-spacer {
  width: 88px;
  height: 1px;
}

@media (max-width: 1100px) {
  .init-page {
    padding: 20px;
  }

  .init-progress {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  .confirm-grid,
  .info-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .progress-arrow {
    justify-content: flex-start;
    padding-left: 20px;
  }

  .progress-arrow-glyph {
    letter-spacing: 0.16em;
    transform: rotate(90deg);
    transform-origin: center;
  }
}

@media (max-width: 640px) {
  .init-page {
    padding: 16px;
  }

  .init-shell {
    min-height: calc(100vh - 32px);
  }

  .init-header h1 {
    font-size: 30px;
  }

  .init-header p {
    font-size: 16px;
  }

  .init-progress {
    grid-template-columns: 1fr;
  }

  .progress-item {
    min-height: 56px;
    padding: 10px 12px;
  }

  .progress-title {
    font-size: 13px;
  }

  .init-footer :deep(.footer-button) {
    min-width: 116px;
    height: 42px;
    padding: 0 16px;
  }
}
</style>
