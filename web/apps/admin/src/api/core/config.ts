import { requestClient } from '#/api/request';

import { normalizeAdminItems } from './admin-response';

function pickDualDateField(
  item: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
): string | undefined {
  const camelVal = item[camelKey];
  if (typeof camelVal === 'string') {
    return camelVal;
  }
  const snakeVal = item[snakeKey];
  if (typeof snakeVal === 'string') {
    return snakeVal;
  }
  return undefined;
}

export namespace ConfigApi {
  export interface ConfigItem {
    created_at?: string;
    config_key: string;
    config_value: string;
    description: string;
    group_code: string;
    id: string;
    is_encrypted?: boolean;
    name: string;
    status: string;
    updated_at?: string;
    value_type: string;
  }
}

export async function getConfigItemListApi(params?: { status?: string }) {
  const response = await requestClient.get<unknown>('/admin/system/configs', {
    params,
  });
  const items = normalizeAdminItems<Record<string, unknown>>(response);
  return {
    items: items.map((item) => ({
      created_at: pickDualDateField(item, 'createdAt', 'created_at'),
      config_key: String(item.configKey ?? item.config_key ?? ''),
      config_value: String(item.configValue ?? item.config_value ?? ''),
      description: String(item.description ?? ''),
      group_code: String(item.groupCode ?? item.group_code ?? ''),
      id: String(item.id ?? ''),
      is_encrypted: Boolean(item.isEncrypted ?? item.is_encrypted),
      name: String(item.name ?? ''),
      status: String(item.status ?? ''),
      updated_at: pickDualDateField(item, 'updatedAt', 'updated_at'),
      value_type: String(item.valueType ?? item.value_type ?? ''),
    })),
  };
}
