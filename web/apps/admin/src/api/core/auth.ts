import CryptoJS from 'crypto-js';

import { requestClient } from '#/api/request';

import { clearStoredRefreshToken, getJwtClaims } from './session';

export namespace AuthApi {
  /** 登录接口参数 */
  export interface LoginParams {
    password?: string;
    username?: string;
  }

  /** 登录接口返回值 */
  export interface LoginResult {
    accessToken: string;
    user: {
      id: string;
      permissions?: string[];
      roles?: string[];
      username: string;
    };
  }

  export interface RabbitmqProfileStatus {
    exchange: {
      name: string;
      ready: boolean;
    };
    extraExchanges: Array<{
      name: string;
      ready: boolean;
    }>;
    name: string;
    queues: Array<{
      name: string;
      ready: boolean;
    }>;
    ready: boolean;
    vhost: string;
    warnings: string[];
  }

  export interface RabbitmqStatusResult {
    managementUrl: string;
    profiles: RabbitmqProfileStatus[];
    ready: boolean;
    warnings: string[];
  }

  export interface EmqxBootstrapCertFile {
    exists: boolean;
    name: string;
    path: string;
  }

  export interface EmqxBootstrapCertStatus {
    certDir: string;
    files: EmqxBootstrapCertFile[];
    ready: boolean;
    warnings: string[];
    writable: boolean;
  }

  export interface InitStatusResult {
    certs: EmqxBootstrapCertStatus;
    certsReady: boolean;
    databaseReady: boolean;
    initialized: boolean;
    initializedAt: null | string;
    rabbitmq: RabbitmqStatusResult;
    rabbitmqReady: boolean;
    seedMode: string;
    usageMode: string;
    warnings: string[];
  }

  export interface InitializeParams {
    email?: string;
    nickname: string;
    password: string;
    usageMode?: string;
    username: string;
    generateBootstrapCerts?: boolean;
  }
}

let initStatusRequest: null | Promise<AuthApi.InitStatusResult> = null;
let initStatusRequestAt = 0;
let initStatusSnapshot: AuthApi.InitStatusResult | null = null;
let initStatusSnapshotAt = 0;
const INIT_STATUS_CACHE_MS = 1500;

function clearInitStatusCache() {
  initStatusRequest = null;
  initStatusRequestAt = 0;
  initStatusSnapshot = null;
  initStatusSnapshotAt = 0;
}

export function getCachedInitStatusApi() {
  if (!initStatusSnapshot) {
    return null;
  }
  if (Date.now() - initStatusSnapshotAt >= INIT_STATUS_CACHE_MS) {
    clearInitStatusCache();
    return null;
  }
  return initStatusSnapshot;
}

export function setCachedInitStatusApi(status: AuthApi.InitStatusResult) {
  initStatusSnapshot = status;
  initStatusSnapshotAt = Date.now();
}

/**
 * 登录
 */
export async function loginApi(data: AuthApi.LoginParams) {
  return requestClient.post<AuthApi.LoginResult>('/admin/auth/login', {
    ...data,
    password: data.password ? CryptoJS.MD5(data.password).toString() : '',
  });
}

export async function getInitStatusApi() {
  const now = Date.now();
  if (initStatusSnapshot && now - initStatusSnapshotAt < INIT_STATUS_CACHE_MS) {
    return Promise.resolve(initStatusSnapshot);
  }
  if (initStatusRequest && now - initStatusRequestAt < INIT_STATUS_CACHE_MS) {
    return initStatusRequest;
  }

  initStatusRequestAt = now;
  initStatusRequest = requestClient
    .get<AuthApi.InitStatusResult>('/admin/system/status')
    .then((result) => {
      initStatusSnapshot = result;
      initStatusSnapshotAt = Date.now();
      return result;
    })
    .catch((error) => {
      clearInitStatusCache();
      throw error;
    });

  return initStatusRequest;
}

export async function initializeSystemApi(data: AuthApi.InitializeParams) {
  const result = await requestClient.post<{
    certs: AuthApi.EmqxBootstrapCertStatus;
    certsReady: boolean;
    initialized: boolean;
    usageMode: string;
    username: string;
  }>(
    '/admin/system/setup',
    {
      ...data,
      password: CryptoJS.MD5(data.password).toString(),
    },
  );
  clearInitStatusCache();
  return result;
}

export async function setupEmqxCertsApi() {
  const result = await requestClient.post<{
    certs: AuthApi.EmqxBootstrapCertStatus;
    certsReady: boolean;
    warnings: string[];
  }>('/admin/system/emqx-certs/setup');
  clearInitStatusCache();
  return result;
}

export async function setupRabbitmqApi() {
  const result = await requestClient.post<{
    rabbitmq: AuthApi.RabbitmqStatusResult;
    rabbitmqReady: boolean;
    warnings: string[];
  }>('/admin/system/rabbitmq/setup');
  clearInitStatusCache();
  return result;
}

/**
 * 刷新accessToken
 */
export async function refreshTokenApi() {
  return null;
}

/**
 * 退出登录
 */
export async function logoutApi() {
  try {
    return await requestClient.post('/admin/auth/logout');
  } finally {
    clearStoredRefreshToken();
  }
}

/**
 * 获取用户权限码
 */
export async function getAccessCodesApi() {
  const claims = getJwtClaims();
  if (claims.permissions?.length) {
    return claims.permissions;
  }
  if (claims.policies?.length) {
    return claims.policies;
  }
  return claims.roles ?? [];
}
