import { useAccessStore } from '@lumimax/stores';

const REFRESH_TOKEN_KEY = 'lumimax_admin_refresh_token';

interface JwtClaims {
  desc?: string;
  homePath?: string;
  permissions?: string[];
  policies?: string[];
  realName?: string;
  roles?: string[];
  tenantId?: null | string;
  type?: number;
  userId?: string;
  username?: string;
  avatar?: string;
}

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return globalThis.atob(padded);
}

function safeParseJwt(token: string): JwtClaims {
  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return {};
    }
    return JSON.parse(decodeBase64Url(payload)) as JwtClaims;
  } catch {
    return {};
  }
}

function getAccessToken() {
  return useAccessStore().accessToken ?? '';
}

function getJwtClaims(token = getAccessToken()) {
  if (!token) {
    return {};
  }
  return safeParseJwt(token);
}

function getStoredRefreshToken() {
  return globalThis.localStorage.getItem(REFRESH_TOKEN_KEY) ?? '';
}

function setStoredRefreshToken(token: string) {
  if (!token) {
    clearStoredRefreshToken();
    return;
  }
  globalThis.localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

function clearStoredRefreshToken() {
  globalThis.localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export {
  clearStoredRefreshToken,
  getAccessToken,
  getJwtClaims,
  getStoredRefreshToken,
  setStoredRefreshToken,
};
