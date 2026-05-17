<script lang="ts" setup>
import type { DebugApi } from '#/api';

import { JsonViewer, Page } from '@lumimax/common-ui';

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Input,
  InputNumber,
  Radio,
  Row,
  Select,
  Space,
  Steps,
  Upload,
  message,
} from 'ant-design-vue';
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import {
  requestDeviceProtocolUploadUrlApi,
  runDeviceProtocolFoodRecognitionApi,
} from '#/api';
import { $t } from '#/locales';

const router = useRouter();

type ImageInputMode = 'existing' | 'upload';

const deviceId = ref('');
const userId = ref('');
const locale = ref('zh-CN');
const market = ref<'CN' | 'US'>('CN');
const weightGram = ref(100);
const imageInputMode = ref<ImageInputMode>('existing');
const skipBrowserUpload = ref(true);
const objectKey = ref('');
const selectedFile = ref<File | null>(null);
const running = ref(false);
const currentStep = ref(0);
const trace = ref<Array<{ status: 'error' | 'finish' | 'process' | 'wait'; title: string }>>([]);
const uploadTrace = ref<DebugApi.DeviceProtocolUploadUrlResult | null>(null);
const result = ref<DebugApi.DeviceProtocolFoodRecognitionResult | null>(null);

const marketOptions = [
  { label: 'CN', value: 'CN' },
  { label: 'US', value: 'US' },
];

const imageModeOptions = computed(() => [
  { label: $t('debug.imageModeExisting'), value: 'existing' as const },
  { label: $t('debug.imageModeUpload'), value: 'upload' as const },
]);

const protocolSteps = computed(() => {
  if (imageInputMode.value === 'existing') {
    return [
      $t('debug.protocolStepMealCreate'),
      $t('debug.protocolStepFoodAnalysis'),
    ];
  }
  if (skipBrowserUpload.value) {
    return [
      $t('debug.protocolStepUploadUrl'),
      `${$t('debug.protocolStepPutObject')} (${$t('debug.protocolStepSkipped')})`,
      $t('debug.protocolStepMealCreate'),
      $t('debug.protocolStepFoodAnalysis'),
    ];
  }
  return [
    $t('debug.protocolStepUploadUrl'),
    $t('debug.protocolStepPutObject'),
    $t('debug.protocolStepMealCreate'),
    $t('debug.protocolStepFoodAnalysis'),
  ];
});

watch(imageInputMode, () => {
  resetTrace();
});

function buildParams() {
  return {
    deviceId: deviceId.value.trim(),
    ...(userId.value.trim() ? { userId: userId.value.trim() } : {}),
    ...(locale.value.trim() ? { locale: locale.value.trim() } : {}),
    market: market.value,
  };
}

function ensureDeviceId() {
  if (!deviceId.value.trim()) {
    message.warning($t('debug.deviceIdRequired'));
    return false;
  }
  return true;
}

function resetTrace() {
  trace.value = protocolSteps.value.map((title) => ({ title, status: 'wait' }));
  currentStep.value = 0;
  uploadTrace.value = null;
  result.value = null;
}

function markStep(index: number, status: 'error' | 'finish' | 'process') {
  trace.value = trace.value.map((item, idx) => {
    if (idx < index) {
      return { ...item, status: 'finish' };
    }
    if (idx === index) {
      return { ...item, status };
    }
    return item;
  });
  currentStep.value = index;
}

async function runRecognitionChain(resolvedObjectKey: string) {
  const mealStepIndex = imageInputMode.value === 'existing' ? 0 : 2;
  markStep(mealStepIndex, 'process');
  const chainResult = await runDeviceProtocolFoodRecognitionApi({
    ...buildParams(),
    objectKey: resolvedObjectKey,
    weightGram: weightGram.value,
  });
  markStep(mealStepIndex, 'finish');
  markStep(mealStepIndex + 1, 'finish');
  result.value = chainResult;
}

async function handleDeviceProtocolTest() {
  if (!ensureDeviceId()) {
    return;
  }
  if (!weightGram.value || weightGram.value <= 0) {
    message.warning($t('debug.weightRequired'));
    return;
  }

  running.value = true;
  resetTrace();

  try {
    if (imageInputMode.value === 'existing') {
      const key = objectKey.value.trim();
      if (!key) {
        message.warning($t('debug.objectKeyRequired'));
        return;
      }
      await runRecognitionChain(key);
      message.success($t('debug.success'));
      return;
    }

    if (!selectedFile.value) {
      message.warning($t('debug.uploadMissingFile'));
      return;
    }

    const file = selectedFile.value;
    markStep(0, 'process');
    const uploadRequest = await requestDeviceProtocolUploadUrlApi({
      ...buildParams(),
      filename: file.name,
      fileType: file.type || 'image/jpeg',
    });
    uploadTrace.value = uploadRequest;
    const uploadUrl = uploadRequest.upload.uploadUrl;
    const resolvedKey = uploadRequest.upload.objectKey;
    if (!resolvedKey) {
      throw new Error($t('debug.protocolUploadUrlMissing'));
    }
    objectKey.value = resolvedKey;
    markStep(0, 'finish');

    if (skipBrowserUpload.value) {
      markStep(1, 'finish');
      message.success($t('debug.protocolCredentialReady'));
      return;
    }

    if (!uploadUrl) {
      throw new Error($t('debug.protocolUploadUrlMissing'));
    }

    markStep(1, 'process');
    try {
      const headers = {
        ...uploadRequest.upload.headers,
        'Content-Type': file.type || 'image/jpeg',
      };
      const uploadResponse = await fetch(uploadUrl, {
        method: uploadRequest.upload.method || 'PUT',
        headers,
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new Error(`upload failed: ${uploadResponse.status}`);
      }
    } catch (error) {
      const isLikelyCors =
        error instanceof TypeError
        || (error instanceof Error && /failed to fetch|cors|network/i.test(error.message));
      if (isLikelyCors) {
        throw new Error(`${$t('debug.protocolCorsHint')} objectKey: ${resolvedKey}`);
      }
      throw error;
    }
    markStep(1, 'finish');

    await runRecognitionChain(resolvedKey);
    message.success($t('debug.success'));
  } catch (error) {
    const failedIndex = Math.min(currentStep.value, protocolSteps.value.length - 1);
    markStep(failedIndex, 'error');
    message.error(error instanceof Error ? error.message : String(error));
  } finally {
    running.value = false;
  }
}

function openPath(path: string) {
  void router.push(path);
}
</script>

<template>
  <Page
    auto-content-height
    :description="$t('debug.protocolDescription')"
    :title="$t('debug.protocolTitle')"
  >
    <Card class="mb-4">
      <Alert class="mb-4" :message="$t('debug.protocolHint')" show-icon type="info" />
      <Alert class="mb-4" :message="$t('debug.protocolCorsHint')" show-icon type="warning" />

      <Row :gutter="16">
        <Col :lg="8" :span="24">
          <div class="mb-1 text-sm font-medium">{{ $t('debug.deviceId') }}</div>
          <Input
            v-model:value="deviceId"
            class="mb-3"
            :placeholder="$t('debug.deviceIdProtocolHelp')"
          />
        </Col>
        <Col :lg="8" :span="24">
          <div class="mb-1 text-sm font-medium">{{ $t('debug.userId') }}</div>
          <Input
            v-model:value="userId"
            class="mb-3"
            :placeholder="$t('debug.userIdOptionalHelp')"
          />
        </Col>
        <Col :lg="4" :span="12">
          <div class="mb-1 text-sm font-medium">{{ $t('debug.weightGram') }}</div>
          <InputNumber v-model:value="weightGram" :min="1" class="mb-3 w-full" />
        </Col>
        <Col :lg="4" :span="12">
          <div class="mb-1 text-sm font-medium">{{ $t('debug.market') }}</div>
          <Select v-model:value="market" :options="marketOptions" class="mb-3 w-full" />
        </Col>
        <Col :lg="4" :span="12">
          <div class="mb-1 text-sm font-medium">{{ $t('debug.locale') }}</div>
          <Input v-model:value="locale" class="mb-3" />
        </Col>
      </Row>

      <div class="mb-3">
        <div class="mb-2 text-sm font-medium">{{ $t('debug.imageInputMode') }}</div>
        <Radio.Group v-model:value="imageInputMode" :options="imageModeOptions" option-type="button" />
      </div>

      <Space class="mb-4" direction="vertical" size="middle">
        <template v-if="imageInputMode === 'existing'">
          <div>
            <div class="mb-1 text-sm font-medium">{{ $t('debug.objectKey') }}</div>
            <Input
              v-model:value="objectKey"
              :placeholder="$t('debug.skipBrowserUploadHelp')"
            />
          </div>
        </template>
        <template v-else>
          <Upload
            :before-upload="(file) => { selectedFile = file as File; return false; }"
            :max-count="1"
            accept="image/*"
            :show-upload-list="true"
          >
            <Button>{{ $t('debug.selectFile') }}</Button>
          </Upload>
          <Checkbox v-model:checked="skipBrowserUpload">
            {{ $t('debug.skipBrowserUpload') }}
          </Checkbox>
          <p v-if="skipBrowserUpload" class="text-xs text-muted-foreground">
            {{ $t('debug.skipBrowserUploadHelp') }}
          </p>
          <div v-if="objectKey">
            <div class="mb-1 text-sm font-medium">{{ $t('debug.objectKey') }}</div>
            <Input v-model:value="objectKey" />
          </div>
        </template>

        <Button :loading="running" size="large" type="primary" @click="handleDeviceProtocolTest">
          {{ $t('debug.protocolRun') }}
        </Button>
      </Space>

      <Steps :current="currentStep" class="mb-6" size="small">
        <Steps.Step
          v-for="(item, index) in trace"
          :key="index"
          :status="item.status"
          :title="item.title"
        />
      </Steps>
    </Card>

    <Row :gutter="16">
      <Col :lg="12" :span="24">
        <Card v-if="uploadTrace" class="mb-4" :title="$t('debug.protocolUploadResult')">
          <JsonViewer :value="uploadTrace" boxed copyable preview-mode />
        </Card>
        <Card v-if="result" :title="$t('debug.protocolChainResult')">
          <JsonViewer :value="result" boxed copyable preview-mode />
        </Card>
      </Col>
      <Col :lg="12" :span="24">
        <Card :title="$t('debug.tabLinks')">
          <Space direction="vertical">
            <Button type="link" @click="openPath('/device/list')">
              {{ $t('debug.openDeviceList') }}
            </Button>
            <Button type="link" @click="openPath('/diet/meal-records')">
              {{ $t('debug.openMealRecords') }}
            </Button>
            <Button type="link" @click="openPath('/diet/recognition-logs')">
              {{ $t('debug.openRecognitionLogs') }}
            </Button>
          </Space>
        </Card>
      </Col>
    </Row>
  </Page>
</template>
