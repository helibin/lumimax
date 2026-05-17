<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { DeviceApi } from '#/api';

import { ref } from 'vue';

import { Page, useVbenDrawer } from '@lumimax/common-ui';
import { Plus } from '@lumimax/icons';
import { useAccessStore } from '@lumimax/stores';
import { formatDateTime } from '@lumimax/utils';

import { Button, Descriptions, message, Modal } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  claimDeviceCredentialApi,
  deleteDeviceApi,
  downloadDeviceCredentialPackageApi,
  getDeviceCredentialApi,
  getDeviceListApi,
  rotateDeviceCredentialApi,
} from '#/api';
import { $t } from '#/locales';

import { useColumns, useFilterSchema } from './data';
import BindForm from './modules/bind-form.vue';
import CommandForm from './modules/command-form.vue';
import CreateForm from './modules/create-form.vue';
import Detail from './modules/detail.vue';

type DeviceActionClickParams = {
  code: string;
  row: DeviceApi.DeviceItem;
};

const accessStore = useAccessStore();
const canViewDeviceCredential =
  accessStore.accessCodes.includes('*') ||
  accessStore.accessCodes.includes('device:credential:view');
const canRotateDeviceCredential =
  accessStore.accessCodes.includes('*') ||
  accessStore.accessCodes.includes('device:credential:rotate');
const canDownloadDeviceCredential =
  accessStore.accessCodes.includes('*') ||
  accessStore.accessCodes.includes('device:credential:download');

const credentialVisible = ref(false);
const credentialLoading = ref(false);
const selectedDevice = ref<DeviceApi.DeviceItem | null>(null);
const credentialDetail = ref<DeviceApi.DeviceCredentialDetail | null>(null);

const [CreateDrawer, createDrawerApi] = useVbenDrawer({
  connectedComponent: CreateForm,
  destroyOnClose: true,
});

const [BindDrawer, bindDrawerApi] = useVbenDrawer({
  connectedComponent: BindForm,
  destroyOnClose: true,
});

const [DetailDrawer, detailDrawerApi] = useVbenDrawer({
  connectedComponent: Detail,
  destroyOnClose: true,
});

const [CommandDrawer, commandDrawerApi] = useVbenDrawer({
  connectedComponent: CommandForm,
  destroyOnClose: true,
});

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: useFilterSchema(),
    submitOnChange: true,
  },
  gridOptions: {
    columns: useColumns(onActionClick, {
      canViewCredential: canViewDeviceCredential,
    }),
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          const response = await getDeviceListApi({
            page: page.currentPage,
            pageSize: page.pageSize,
          });
          const keyword = String(formValues?.keyword ?? '')
            .trim()
            .toLowerCase();
          const status = String(formValues?.status ?? '').trim();
          const items = response.items.filter((item) => {
            const matchesKeyword =
              !keyword ||
              item.name.toLowerCase().includes(keyword) ||
              (item.sn ?? '').toLowerCase().includes(keyword) ||
              item.id.toLowerCase().includes(keyword);
            const matchesStatus = !status || item.status === status;
            return matchesKeyword && matchesStatus;
          });
          return {
            items,
            total: items.length,
          };
        },
      },
    },
    rowConfig: {
      keyField: 'id',
    },
    toolbarConfig: {
      custom: true,
      export: false,
      refresh: true,
      search: true,
      zoom: true,
    },
  } as VxeTableGridOptions<DeviceApi.DeviceItem>,
});

function onRefresh() {
  gridApi.query();
}

function onCreate() {
  createDrawerApi.open();
}

function onDetail(row: DeviceApi.DeviceItem) {
  detailDrawerApi.setData(row).open();
}

function onCredential(row: DeviceApi.DeviceItem) {
  selectedDevice.value = row;
  credentialVisible.value = true;
  void loadCredential(row.id);
}

function onBind(row: DeviceApi.DeviceItem) {
  bindDrawerApi.setData(row).open();
}

function onCommand(row: DeviceApi.DeviceItem) {
  commandDrawerApi.setData(row).open();
}

function onDelete(row: DeviceApi.DeviceItem) {
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deleting', [row.name]),
    duration: 0,
    key: 'action_process_msg',
  });
  deleteDeviceApi(row.id)
    .then(() => {
      message.success({
        content: $t('ui.actionMessage.deleteSuccess', [row.name]),
        key: 'action_process_msg',
      });
      onRefresh();
    })
    .catch(() => {
      hideLoading();
    });
}

function onActionClick({ code, row }: DeviceActionClickParams) {
  switch (code) {
    case 'bind': {
      onBind(row);
      break;
    }
    case 'credential': {
      onCredential(row);
      break;
    }
    case 'command': {
      onCommand(row);
      break;
    }
    case 'delete': {
      onDelete(row);
      break;
    }
    case 'detail': {
      onDetail(row);
      break;
    }
  }
}

function formatTime(value?: null | string) {
  return value ? formatDateTime(value) : '-';
}

function isCredentialRotationPending(detail: DeviceApi.DeviceCredentialDetail | null) {
  const status = String(detail?.status ?? '')
    .trim()
    .toLowerCase();
  return status === 'rotate_requested' || status === 'rotating';
}

function isAliyunCredential(detail: DeviceApi.DeviceCredentialDetail | null) {
  return (detail?.vendor ?? detail?.provider) === 'aliyun';
}

function credentialReference(detail: DeviceApi.DeviceCredentialDetail | null) {
  return detail?.credentialId || detail?.certificateArn || '-';
}

function credentialPanelTitle() {
  return $t('device.deviceCredentialInfo');
}

function copyCredentialLabel() {
  return $t('device.copyDeviceCredential');
}

function downloadCredentialLabel() {
  return $t('device.downloadDeviceCredentialPackage');
}

function rotateCredentialTitle() {
  return $t('device.rotateDeviceCredentialTitle');
}

function rotateCredentialConfirm() {
  return $t('device.rotateDeviceCredentialConfirm');
}

function credentialHelpText(detail: DeviceApi.DeviceCredentialDetail | null) {
  if (detail?.claimAvailable) {
    return $t('device.deviceCredentialHelp');
  }
  if (isCredentialRotationPending(detail)) {
    return $t('device.deviceCredentialRotationPendingHelp');
  }
  if (detail?.claimedAt) {
    return $t('device.deviceCredentialClaimedHelp');
  }
  return $t('device.deviceCredentialUnavailableWithRotate');
}

async function loadCredential(id: string) {
  credentialLoading.value = true;
  try {
    credentialDetail.value = await getDeviceCredentialApi(id);
  } finally {
    credentialLoading.value = false;
  }
}

async function copyCredential() {
  const id = selectedDevice.value?.id;
  if (!id || !credentialDetail.value?.claimAvailable) {
    message.warning(
      $t('device.deviceCredentialUnavailable'),
    );
    return;
  }
  try {
    const result = await claimDeviceCredentialApi(id);
    await navigator.clipboard.writeText(result.clipboardText);
    message.success(
      $t('device.deviceCredentialCopied'),
    );
    await loadCredential(id);
  } catch {
    message.error(
      $t('device.deviceCredentialClaimFailed'),
    );
  }
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.append(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function downloadCredentialPackage() {
  const id = selectedDevice.value?.id;
  if (!id) {
    return;
  }
  try {
    const { blob, fileName } = await downloadDeviceCredentialPackageApi(id);
    triggerDownload(blob, fileName);
    message.success(
      $t('device.deviceCredentialPackageDownloaded'),
    );
    await loadCredential(id);
  } catch {
    message.error(
      $t('device.deviceCredentialPackageDownloadFailed'),
    );
  }
}

async function rotateCredential() {
  const id = selectedDevice.value?.id;
  if (!id) {
    return;
  }
  Modal.confirm({
    title: rotateCredentialTitle(),
    content: rotateCredentialConfirm(),
    okText: $t('common.confirm'),
    cancelText: $t('common.cancel'),
    async onOk() {
      try {
        await rotateDeviceCredentialApi(id, {});
        message.success(
          $t('device.rotateDeviceCredentialRequested'),
        );
        await loadCredential(id);
      } catch {
        message.error(
          $t('device.rotateDeviceCredentialFailed'),
        );
      }
    },
  });
}

function onCredentialModalCancel() {
  credentialDetail.value = null;
  selectedDevice.value = null;
}
</script>

<template>
  <Page auto-content-height>
    <CreateDrawer @success="onRefresh" />
    <BindDrawer @success="onRefresh" />
    <DetailDrawer />
    <CommandDrawer @success="onRefresh" />
    <Grid :table-title="$t('device.title')">
      <template #toolbar-tools>
        <Button type="primary" @click="onCreate">
          <Plus class="size-5" />
          {{ $t('device.create') }}
        </Button>
      </template>
    </Grid>
    <Modal
      v-model:open="credentialVisible"
      :title="`${credentialPanelTitle()} - ${selectedDevice?.name ?? ''}`"
      :footer="null"
      width="760px"
      @cancel="onCredentialModalCancel"
    >
      <div class="space-y-3">
        <div class="flex items-center justify-end gap-2">
          <Button
            size="small"
            type="default"
            :disabled="!credentialDetail?.claimAvailable"
            @click="copyCredential"
          >
            {{ copyCredentialLabel() }}
          </Button>
          <Button
            v-if="canDownloadDeviceCredential"
            size="small"
            type="primary"
            :disabled="!credentialDetail?.claimAvailable"
            @click="downloadCredentialPackage"
          >
            {{ downloadCredentialLabel() }}
          </Button>
          <Button
            v-if="canRotateDeviceCredential"
            size="small"
            type="default"
            @click="rotateCredential"
          >
            {{
              credentialDetail?.available
                ? $t('device.rotateCertificate')
                : $t('device.rotateCertificateApply')
            }}
          </Button>
        </div>
        <Descriptions :column="2" bordered size="small">
          <Descriptions.Item :label="$t('device.certificateStatus')">
            {{ credentialDetail?.status || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.certificateSource')">
            {{ credentialDetail?.source || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.certificateVendor')">
            {{ credentialDetail?.vendor || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.certificateType')">
            {{ credentialDetail?.credentialType || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.deviceProductKey')">
            {{ credentialDetail?.productKey || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.thingName')">
            {{ credentialDetail?.thingName || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.credentialReference')">
            {{ credentialReference(credentialDetail) }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.certificateRegion')">
            {{ credentialDetail?.region || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.certificateEndpoint')">
            {{ credentialDetail?.endpoint || '-' }}
          </Descriptions.Item>
          <Descriptions.Item
            :label="
              isAliyunCredential(credentialDetail)
                ? $t('device.deviceSecretAvailable')
                : $t('device.certificateFingerprint')
            "
          >
            {{
              isAliyunCredential(credentialDetail)
                ? credentialDetail?.hasDeviceSecret
                  ? $t('common.yes')
                  : $t('common.no')
                : credentialDetail?.fingerprint || '-'
            }}
          </Descriptions.Item>
          <Descriptions.Item
            :label="
              isAliyunCredential(credentialDetail)
                ? $t('device.deviceSecretClaimed')
                : $t('device.certificatePrivateKey')
            "
          >
            {{
              isAliyunCredential(credentialDetail)
                ? credentialDetail?.hasDeviceSecret
                  ? $t('common.yes')
                  : $t('common.no')
                : credentialDetail?.hasPrivateKey
                  ? $t('common.yes')
                  : $t('common.no')
            }}
          </Descriptions.Item>
          <Descriptions.Item
            v-if="!isAliyunCredential(credentialDetail)"
            :label="$t('device.certificateFingerprint')"
          >
            {{ credentialDetail?.fingerprint || '-' }}
          </Descriptions.Item>
          <Descriptions.Item
            v-if="!isAliyunCredential(credentialDetail)"
            :label="$t('device.certificatePrivateKey')"
          >
            {{ credentialDetail?.hasPrivateKey ? $t('common.yes') : $t('common.no') }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.certificateIssuedAt')">
            {{ formatTime(credentialDetail?.issuedAt) }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.certificateUpdatedAt')">
            {{ formatTime(credentialDetail?.updatedAt) }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.certificateClaimedAt')">
            {{ formatTime(credentialDetail?.claimedAt) }}
          </Descriptions.Item>
        </Descriptions>
        <div class="text-xs text-text-secondary">
          {{ credentialHelpText(credentialDetail) }}
        </div>
      </div>
    </Modal>
  </Page>
</template>
