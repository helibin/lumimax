<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { AuditApi } from '#/api';

import { Page, useVbenDrawer } from '@lumimax/common-ui';

import dayjs from 'dayjs';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getAuditLogListApi } from '#/api';
import { $t } from '#/locales';

import { useColumns, useFilterSchema } from './data';
import Detail from './modules/detail.vue';

type AuditActionClickParams = {
  code: string;
  row: AuditApi.AuditLogItem;
};

const [DetailDrawer, detailDrawerApi] = useVbenDrawer({
  connectedComponent: Detail,
  destroyOnClose: true,
});

const [Grid] = useVbenVxeGrid({
  formOptions: {
    schema: useFilterSchema(),
    submitOnChange: true,
  },
  gridOptions: {
    columns: useColumns(onActionClick),
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          const response = await getAuditLogListApi({
            action: String(formValues?.action ?? '').trim() || undefined,
            endAt: toIsoString(formValues?.endAt),
            keyword: String(formValues?.keyword ?? '').trim() || undefined,
            page: page.currentPage,
            pageSize: page.pageSize,
            resourceType: String(formValues?.resourceType ?? '').trim() || undefined,
            startAt: toIsoString(formValues?.startAt),
          });
          return {
            items: response.items as AuditApi.AuditLogItem[],
            total: response.total,
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
  } as VxeTableGridOptions<AuditApi.AuditLogItem>,
});

function onActionClick({ code, row }: AuditActionClickParams) {
  if (code === 'detail') {
    detailDrawerApi.setData(row).open();
  }
}

function toIsoString(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value === 'string') {
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed.toISOString() : undefined;
  }
  if (typeof value === 'object' && value !== null && 'toISOString' in value) {
    const candidate = value as { toISOString: () => string };
    return candidate.toISOString();
  }
  return undefined;
}
</script>

<template>
  <Page auto-content-height>
    <DetailDrawer />
    <Grid :table-title="$t('system.audit.title')" />
  </Page>
</template>
