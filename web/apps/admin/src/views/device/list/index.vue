<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { DeviceApi } from '#/api';

import { ref } from 'vue';

import { JsonViewer, Page, useVbenDrawer } from '@lumimax/common-ui';
import { Plus } from '@lumimax/icons';
import { useAccessStore } from '@lumimax/stores';
import { formatDateTime } from '@lumimax/utils';

import { Button, Collapse, Descriptions, message, Modal } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  claimDeviceCertificateApi,
  deleteDeviceApi,
  downloadDeviceCertificatePackageApi,
  getDeviceCertificateApi,
  getDeviceListApi,
  rotateDeviceCertificateApi,
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
const canViewDeviceCertificate =
  accessStore.accessCodes.includes('*') ||
  accessStore.accessCodes.includes('device:certificate:view');
const canRotateDeviceCertificate =
  accessStore.accessCodes.includes('*') ||
  accessStore.accessCodes.includes('device:certificate:rotate');
const canDownloadDeviceCertificate =
  accessStore.accessCodes.includes('*') ||
  accessStore.accessCodes.includes('device:certificate:download');

const certificateVisible = ref(false);
const certificateLoading = ref(false);
const selectedDevice = ref<DeviceApi.DeviceItem | null>(null);
const certificateDetail = ref<DeviceApi.DeviceCertificateDetail | null>(null);

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
      canViewCertificate: canViewDeviceCertificate,
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

function onCertificate(row: DeviceApi.DeviceItem) {
  selectedDevice.value = row;
  certificateVisible.value = true;
  void loadCertificate(row.id);
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
    case 'certificate': {
      onCertificate(row);
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

function isCertificateRotationPending(detail: DeviceApi.DeviceCertificateDetail | null) {
  const status = String(detail?.status ?? '')
    .trim()
    .toLowerCase();
  return status === 'rotate_requested' || status === 'rotating';
}

function isAliyunCredential(detail: DeviceApi.DeviceCertificateDetail | null) {
  return (detail?.vendor ?? detail?.provider) === 'aliyun';
}

function credentialReference(detail: DeviceApi.DeviceCertificateDetail | null) {
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

function certificateHelpText(detail: DeviceApi.DeviceCertificateDetail | null) {
  if (detail?.claimAvailable) {
    return $t('device.deviceCredentialHelp');
  }
  if (isCertificateRotationPending(detail)) {
    return $t('device.deviceCredentialRotationPendingHelp');
  }
  if (detail?.claimedAt) {
    return $t('device.deviceCredentialClaimedHelp');
  }
  return $t('device.deviceCredentialUnavailableWithRotate');
}

async function loadCertificate(id: string) {
  certificateLoading.value = true;
  try {
    certificateDetail.value = await getDeviceCertificateApi(id);
  } finally {
    certificateLoading.value = false;
  }
}

async function copyCertificatePem() {
  const id = selectedDevice.value?.id;
  if (!id || !certificateDetail.value?.claimAvailable) {
    message.warning(
      $t('device.deviceCredentialUnavailable'),
    );
    return;
  }
  try {
    const result = await claimDeviceCertificateApi(id);
    await navigator.clipboard.writeText(result.clipboardText);
    message.success(
      $t('device.deviceCredentialCopied'),
    );
    await loadCertificate(id);
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

async function downloadCertificatePackage() {
  const id = selectedDevice.value?.id;
  if (!id) {
    return;
  }
  try {
    const { blob, fileName } = await downloadDeviceCertificatePackageApi(id);
    triggerDownload(blob, fileName);
    message.success(
      $t('device.deviceCredentialPackageDownloaded'),
    );
    await loadCertificate(id);
  } catch {
    message.error(
      $t('device.deviceCredentialPackageDownloadFailed'),
    );
  }
}

async function rotateCertificate() {
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
        await rotateDeviceCertificateApi(id, {});
        message.success(
          $t('device.rotateDeviceCredentialRequested'),
        );
        await loadCertificate(id);
      } catch {
        message.error(
          $t('device.rotateDeviceCredentialFailed'),
        );
      }
    },
  });
}

function onCertificateModalCancel() {
  certificateDetail.value = null;
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
          {{ $t('ui.actionTitle.create', [$t('device.name')]) }}
        </Button>
      </template>
    </Grid>
    <Modal
      v-model:open="certificateVisible"
      :title="`${credentialPanelTitle()} - ${selectedDevice?.name ?? ''}`"
      :footer="null"
      width="760px"
      @cancel="onCertificateModalCancel"
    >
      <div class="space-y-3">
        <div class="flex items-center justify-end gap-2">
          <Button
            size="small"
            type="default"
            :disabled="!certificateDetail?.claimAvailable"
            @click="copyCertificatePem"
          >
            {{ copyCredentialLabel() }}
          </Button>
          <Button
            v-if="canDownloadDeviceCertificate"
            size="small"
            type="primary"
            :disabled="!certificateDetail?.claimAvailable"
            @click="downloadCertificatePackage"
          >
            {{ downloadCredentialLabel() }}
          </Button>
          <Button
            v-if="canRotateDeviceCertificate"
            size="small"
            type="default"
            @click="rotateCertificate"
          >
            {{
              certificateDetail?.available
                ? $t('device.rotateCertificate')
                : $t('device.rotateCertificateApply')
            }}
          </Button>
        </div>
        <Descriptions :column="2" bordered size="small">
          <Descriptions.Item :label="$t('device.certificateStatus')">
            {{ certificateDetail?.status || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.certificateSource')">
            {{ certificateDetail?.source || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.certificateVendor')">
            {{ certificateDetail?.vendor || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.certificateType')">
            {{ certificateDetail?.credentialType || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.deviceProductKey')">
            {{ certificateDetail?.productKey || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.thingName')">
            {{ certificateDetail?.thingName || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.credentialReference')">
            {{ credentialReference(certificateDetail) }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.certificateRegion')">
            {{ certificateDetail?.region || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.certificateEndpoint')">
            {{ certificateDetail?.endpoint || '-' }}
          </Descriptions.Item>
          <Descriptions.Item
            :label="
              isAliyunCredential(certificateDetail)
                ? $t('device.deviceSecretAvailable')
                : $t('device.certificateFingerprint')
            "
          >
            {{
              isAliyunCredential(certificateDetail)
                ? certificateDetail?.hasDeviceSecret
                  ? $t('common.yes')
                  : $t('common.no')
                : certificateDetail?.fingerprint || '-'
            }}
          </Descriptions.Item>
          <Descriptions.Item
            :label="
              isAliyunCredential(certificateDetail)
                ? $t('device.deviceSecretClaimed')
                : $t('device.certificatePrivateKey')
            "
          >
            {{
              isAliyunCredential(certificateDetail)
                ? certificateDetail?.hasDeviceSecret
                  ? $t('common.yes')
                  : $t('common.no')
                : certificateDetail?.hasPrivateKey
                  ? $t('common.yes')
                  : $t('common.no')
            }}
          </Descriptions.Item>
          <Descriptions.Item
            v-if="!isAliyunCredential(certificateDetail)"
            :label="$t('device.certificateFingerprint')"
          >
            {{ certificateDetail?.fingerprint || '-' }}
          </Descriptions.Item>
          <Descriptions.Item
            v-if="!isAliyunCredential(certificateDetail)"
            :label="$t('device.certificatePrivateKey')"
          >
            {{ certificateDetail?.hasPrivateKey ? $t('common.yes') : $t('common.no') }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.certificateIssuedAt')">
            {{ formatTime(certificateDetail?.issuedAt) }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.certificateUpdatedAt')">
            {{ formatTime(certificateDetail?.updatedAt) }}
          </Descriptions.Item>
          <Descriptions.Item :label="$t('device.certificateClaimedAt')">
            {{ formatTime(certificateDetail?.claimedAt) }}
          </Descriptions.Item>
        </Descriptions>
        <div class="text-xs text-text-secondary">
          {{ certificateHelpText(certificateDetail) }}
        </div>
        <Collapse v-if="!certificateLoading" ghost>
          <Collapse.Panel key="raw-json" :header="$t('device.rawCredentialPayload')">
            <div class="max-h-56 overflow-y-auto">
              <JsonViewer :value="certificateDetail ?? {}" boxed copyable preview-mode />
            </div>
          </Collapse.Panel>
        </Collapse>
      </div>
    </Modal>
  </Page>
</template>
