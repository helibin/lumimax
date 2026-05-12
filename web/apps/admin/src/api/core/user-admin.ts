import CryptoJS from 'crypto-js';

import { requestClient } from '#/api/request';

import { normalizeAdminPaged } from './admin-response';

export namespace UserAdminApi {
  export type UserStatus = 'active' | 'disabled';

  export interface UserItem {
    email: string;
    createdAt: string;
    id: string;
    lastActiveAt?: null | string;
    lastLoginAt?: null | string;
    nickname: string;
    phone: string;
    roleIds?: string[];
    roles: string[];
    status: UserStatus;
    updatedAt: string;
    username: string;
  }

  export interface CreateUserParams {
    email?: string;
    nickname: string;
    password: string;
    phone?: string;
    roleIds?: string[];
    username: string;
  }

  export interface UpdateUserParams {
    email?: string;
    nickname?: string;
    password?: string;
    phone?: string;
    roleIds?: string[];
  }
}

interface PagedResult<T> {
  items: T[];
  total: number;
}

function pickString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

function normalizeUserStatus(value: unknown): UserAdminApi.UserStatus {
  return value === 'disabled' ? 'disabled' : 'active';
}

function normalizeUserItem(payload: unknown): UserAdminApi.UserItem {
  const item =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};

  return {
    email: pickString(item.email),
    createdAt: pickString(item.createdAt ?? item.created_at),
    id: pickString(item.id),
    lastActiveAt: pickString(item.lastActiveAt ?? item.last_active_at) || null,
    lastLoginAt: pickString(item.lastLoginAt ?? item.last_login_at) || null,
    nickname: pickString(item.nickname),
    phone: pickString(item.phone),
    roleIds: Array.isArray(item.roleIds)
      ? item.roleIds.filter((roleId): roleId is string => typeof roleId === 'string')
      : undefined,
    roles: Array.isArray(item.roles)
      ? item.roles.filter((role): role is string => typeof role === 'string')
      : [],
    status: normalizeUserStatus(item.status),
    updatedAt: pickString(item.updatedAt ?? item.updated_at),
    username: pickString(item.username),
  };
}

export async function getUserListApi(params?: { page?: number; pageSize?: number }) {
  const response = await requestClient.get<PagedResult<unknown>>('/admin/system/admin-users', {
    params,
  });
  const result = normalizeAdminPaged<unknown>(response);
  return {
    items: result.items.map((item) => normalizeUserItem(item)),
    total: result.total,
  } satisfies PagedResult<UserAdminApi.UserItem>;
}

export async function getUserDetailApi(id: string) {
  const response = await requestClient.get<unknown>(`/admin/system/admin-users/${id}`);
  return normalizeUserItem(response);
}

export async function createUserApi(data: UserAdminApi.CreateUserParams) {
  const response = await requestClient.post<unknown>('/admin/system/admin-users', {
    ...data,
    password: data.password ? CryptoJS.MD5(data.password).toString() : '',
  });
  return normalizeUserItem(response);
}

export async function updateUserApi(id: string, data: UserAdminApi.UpdateUserParams) {
  const response = await requestClient.request<unknown>(`/admin/system/admin-users/${id}`, {
    data,
    method: 'PATCH',
  });
  return normalizeUserItem(response);
}

export async function resetUserPasswordApi(userId: string, data: { newPassword: string }) {
  return requestClient.request(`/admin/system/admin-users/${userId}/password`, {
    data: {
      newPassword: data.newPassword ? CryptoJS.MD5(data.newPassword).toString() : '',
    },
    method: 'PATCH',
  });
}
