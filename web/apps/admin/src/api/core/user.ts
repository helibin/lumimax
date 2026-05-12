import type { UserInfo } from '@lumimax/types';

import { requestClient } from '#/api/request';

import { getAccessToken, getJwtClaims } from './session';

interface IdentityMeResult {
  email?: string;
  id: string;
  nickname?: string;
  permissions?: string[];
  roles?: string[];
  status: string;
  username: string;
}

function normalizeHomePath(value?: string) {
  const homePath = typeof value === 'string' ? value.trim() : '';
  if (!homePath) {
    return '/analytics';
  }
  const homePathMap: Record<string, string> = {
    '/dashboard': '/analytics',
    '/dashboard/index': '/analytics',
    '/dashboard/analytics': '/analytics',
    '/dashboard/analytics/index': '/analytics',
    '/dashboard/workspace': '/workspace',
    '/dashboard/workspace/index': '/workspace',
    '/system/menus': '/system/menu',
    '/system/roles': '/system/role',
    '/system/admin-users': '/system/user',
    '/system/dictionaries': '/system/dict',
    '/system/configs': '/system/config',
  };
  return homePathMap[homePath] ?? homePath;
}

/**
 * 获取用户信息
 */
export async function getUserInfoApi() {
  const profile = await requestClient.get<IdentityMeResult>('/admin/auth/me');
  const claims = getJwtClaims();
  const username = profile.username || claims.username || '';
  const realName = profile.nickname || claims.realName || username || 'Admin';

  return {
    userId: profile.id,
    username,
    realName,
    avatar:
      claims.avatar ||
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(realName)}`,
    roles: profile.roles ?? claims.roles ?? [],
    desc: claims.desc ?? `${profile.status}`,
    homePath: normalizeHomePath(claims.homePath),
    token: getAccessToken(),
  } satisfies UserInfo;
}
