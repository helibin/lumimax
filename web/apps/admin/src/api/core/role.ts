import { requestClient } from '#/api/request';

import { normalizeAdminItems, normalizeAdminPaged } from './admin-response';

export namespace RoleApi {
  export interface PermissionItem {
    code: string;
    description: string;
    groupCode: string;
    id: string;
    name: string;
  }

  export interface RoleItem {
    code: string;
    description?: string;
    id: string;
    name: string;
    permissions: PermissionItem[];
    status?: string;
  }

  export interface CreateRoleParams {
    code: string;
    description?: string;
    name: string;
  }

  export interface UpdateRoleParams {
    description?: string;
    name: string;
  }
}

interface PagedResult<T> {
  items: T[];
  total: number;
}

function pickString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function pickObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizePermissionItem(payload: unknown): RoleApi.PermissionItem {
  const item = pickObject(payload);
  return {
    code: pickString(item.code) ?? '',
    description: pickString(item.description) ?? '',
    groupCode: pickString(item.groupCode ?? item.group_code) ?? '',
    id: pickString(item.id) ?? '',
    name: pickString(item.name) ?? '',
  };
}

export async function getRoleListApi(params?: { page?: number; pageSize?: number }) {
  const response = await requestClient.get<unknown>('/admin/system/roles', {
    params,
  });
  const result = normalizeAdminPaged<unknown>(response);
  return {
    items: result.items.map((item) => normalizeRoleItem(item)),
    total: result.total,
  } satisfies PagedResult<RoleApi.RoleItem>;
}

export async function getRoleDetailApi(id: string) {
  const response = await requestClient.get<unknown>(`/admin/system/roles/${id}`);
  return normalizeRoleItem(response);
}

export async function createRoleApi(data: RoleApi.CreateRoleParams) {
  const response = await requestClient.post<unknown>('/admin/system/roles', data);
  return normalizeRoleItem(response);
}

export async function updateRoleApi(id: string, data: RoleApi.UpdateRoleParams) {
  const response = await requestClient.request<unknown>(`/admin/system/roles/${id}`, {
    data,
    method: 'PATCH',
  });
  return normalizeRoleItem(response);
}

export async function getPermissionListApi(params?: { groupCode?: string; keyword?: string }) {
  const response = await requestClient.get<
    unknown[] | { items?: unknown[]; items_json?: string[] }
  >('/admin/system/permissions', { params });
  const items = normalizeAdminItems(response);
  return {
    items: items.map((item) => normalizePermissionItem(item)),
  };
}

export async function updateRolePermissionsApi(id: string, data: { permissionIds: string[] }) {
  return requestClient.put(`/admin/system/roles/${id}/permissions`, data);
}

function normalizeRoleItem(payload: unknown): RoleApi.RoleItem {
  const item = pickObject(payload);
  return {
    code: pickString(item.code) ?? '',
    description: pickString(item.description) ?? undefined,
    id: pickString(item.id) ?? '',
    name: pickString(item.name) ?? '',
    permissions: normalizeAdminItems(item.permissions).map((entry) =>
      normalizePermissionItem(entry),
    ),
    status: pickString(item.status) ?? undefined,
  };
}
