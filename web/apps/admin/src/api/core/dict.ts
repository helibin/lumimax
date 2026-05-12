import { requestClient } from '#/api/request';

import { normalizeAdminItems } from './admin-response';

export namespace DictApi {
  export interface DictTypeItem {
    code: string;
    description: string;
    name: string;
    status: string;
  }

  export interface DictItem {
    dictionary_code: string;
    extra_json: string;
    id: string;
    label: string;
    sort: number;
    status: string;
    value: string;
  }

  export interface CreateDictTypeParams {
    code: string;
    description?: string;
    name: string;
  }

  export interface UpdateDictTypeParams {
    description?: string;
    name: string;
  }

  export interface CreateDictItemParams {
    extra?: Record<string, unknown>;
    label: string;
    sort?: number;
    status?: 'active' | 'disabled';
    value: string;
  }

  export type UpdateDictItemParams = CreateDictItemParams;
}

function pickString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

function pickObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeDictTypeItem(payload: unknown): DictApi.DictTypeItem {
  const item = pickObject(payload);
  return {
    code: pickString(item.code),
    description: pickString(item.description),
    name: pickString(item.name),
    status: pickString(item.status),
  };
}

function normalizeDictItem(payload: unknown): DictApi.DictItem {
  const item = pickObject(payload);
  return {
    dictionary_code: pickString(item.dictionary_code ?? item.dictionaryCode),
    extra_json: JSON.stringify(pickObject(item.extra_json ?? item.extra)),
    id: pickString(item.id),
    label: pickString(item.label),
    sort: typeof item.sort === 'number' ? item.sort : 0,
    status: pickString(item.status),
    value: pickString(item.value),
  };
}

export async function getDictTypeListApi(params?: { status?: string }) {
  const response = await requestClient.get<unknown>('/admin/dictionaries', {
    params,
  });
  return {
    items: normalizeAdminItems(response).map((item) => normalizeDictTypeItem(item)),
  };
}

export async function getDictItemsApi(dictType: string, params?: { status?: string }) {
  const response = await requestClient.get<
    unknown[] | { items?: unknown[]; items_json?: string[] }
  >(`/admin/dictionaries/${encodeURIComponent(dictType)}/items`, { params });
  const items = normalizeAdminItems(response);
  return {
    items: items.map((item) => normalizeDictItem(item)),
  };
}

export async function createDictTypeApi(data: DictApi.CreateDictTypeParams) {
  return requestClient.post('/admin/dictionaries', {
    code: pickString(data.code),
    description: pickString(data.description) || undefined,
    name: pickString(data.name),
  });
}

export async function updateDictTypeApi(code: string, data: DictApi.UpdateDictTypeParams) {
  return requestClient.patch(`/admin/dictionaries/${encodeURIComponent(code)}`, {
    description: pickString(data.description) || undefined,
    name: pickString(data.name),
  });
}

export async function deleteDictTypeApi(code: string) {
  return requestClient.delete(`/admin/dictionaries/${encodeURIComponent(code)}`);
}

export async function createDictItemApi(dictType: string, data: DictApi.CreateDictItemParams) {
  return requestClient.post(`/admin/dictionaries/${encodeURIComponent(dictType)}/items`, {
    extra: data.extra ?? {},
    label: pickString(data.label),
    sort: typeof data.sort === 'number' ? data.sort : 0,
    status: data.status ?? 'active',
    value: pickString(data.value),
  });
}

export async function deleteDictItemApi(id: string) {
  return requestClient.delete(`/admin/dictionaries/items/${encodeURIComponent(id)}`);
}

export async function updateDictItemApi(id: string, data: DictApi.UpdateDictItemParams) {
  return requestClient.patch(`/admin/dictionaries/items/${encodeURIComponent(id)}`, {
    extra: data.extra ?? {},
    label: pickString(data.label),
    sort: typeof data.sort === 'number' ? data.sort : 0,
    status: data.status ?? 'active',
    value: pickString(data.value),
  });
}
