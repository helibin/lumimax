/**
 * 该文件可自行根据业务逻辑进行调整
 */
import type { RequestClientOptions } from '@lumimax/request';

import { useAppConfig } from '@lumimax/hooks';
import { preferences } from '@lumimax/preferences';
import {
  authenticateResponseInterceptor,
  defaultResponseInterceptor,
  errorMessageResponseInterceptor,
  RequestClient,
} from '@lumimax/request';
import { useAccessStore } from '@lumimax/stores';

import { message } from 'ant-design-vue';

import { useAuthStore } from '#/store';

import { refreshTokenApi } from './core';
import { clearStoredRefreshToken, getStoredRefreshToken } from './core/session';

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);

function appendApiPrefix(url: string | undefined) {
  const base = typeof url === 'string' && url.length > 0 ? url : '/';
  return base.endsWith('/api') ? base : `${base.replace(/\/$/, '')}/api`;
}

function pickReadableErrorMessage(fallbackMessage: string, responseData: Record<string, any>) {
  const businessMessage = responseData?.msg;
  if (typeof businessMessage === 'string' && businessMessage.trim()) {
    return businessMessage.trim();
  }

  const rawMessage = responseData?.error?.rawMessage;
  if (typeof rawMessage === 'string' && rawMessage.trim()) {
    return rawMessage.trim();
  }

  const detailMessage = responseData?.error?.details?.message;
  if (typeof detailMessage === 'string' && detailMessage.trim()) {
    return detailMessage.trim();
  }

  const validationErrors = responseData?.error?.details?.errors;
  if (Array.isArray(validationErrors)) {
    const firstError = validationErrors.find((item) => typeof item === 'string' && item.trim());
    if (firstError) {
      return firstError.trim();
    }
  }

  const plainErrorMessage = responseData?.error;
  if (typeof plainErrorMessage === 'string' && plainErrorMessage.trim()) {
    return plainErrorMessage.trim();
  }

  const plainMessage = responseData?.message;
  if (typeof plainMessage === 'string' && plainMessage.trim()) {
    return plainMessage.trim();
  }

  return fallbackMessage;
}

function createRequestClient(baseURL: string, options?: RequestClientOptions) {
  const client = new RequestClient({
    ...options,
    baseURL,
  });

  /**
   * 重新认证逻辑
   */
  async function doReAuthenticate() {
    console.warn('Access token or refresh token is invalid or expired. ');
    const accessStore = useAccessStore();
    const authStore = useAuthStore();
    accessStore.setAccessToken(null);
    clearStoredRefreshToken();
    if (preferences.app.loginExpiredMode === 'modal' && accessStore.isAccessChecked) {
      accessStore.setLoginExpired(true);
    } else {
      await authStore.logout(true, false);
    }
  }

  /**
   * 刷新token逻辑
   */
  async function doRefreshToken() {
    const accessStore = useAccessStore();
    const resp = (await refreshTokenApi()) as null | { accessToken?: string };
    const newToken = resp?.accessToken ?? '';
    if (!newToken) {
      throw new Error('refresh token response missing access token');
    }
    accessStore.setAccessToken(newToken);
    return newToken;
  }

  function formatToken(token: null | string) {
    return token ? `Bearer ${token}` : null;
  }

  // 请求头处理
  client.addRequestInterceptor({
    fulfilled: async (config) => {
      const accessStore = useAccessStore();

      config.headers.Authorization = formatToken(accessStore.accessToken);
      config.headers['Accept-Language'] = preferences.app.locale;
      return config;
    },
  });

  // 处理返回的响应数据格式
  client.addResponseInterceptor(
    defaultResponseInterceptor({
      codeField: 'code',
      dataField: 'data',
      successCode: 0,
    }),
  );

  // token过期的处理
  client.addResponseInterceptor(
    authenticateResponseInterceptor({
      client,
      doReAuthenticate,
      doRefreshToken,
      enableRefreshToken: preferences.app.enableRefreshToken && Boolean(getStoredRefreshToken()),
      formatToken,
    }),
  );

  // 通用的错误处理,如果没有进入上面的错误处理逻辑，就会进入这里
  client.addResponseInterceptor(
    errorMessageResponseInterceptor((msg: string, error) => {
      const responseData = error?.response?.data ?? {};
      const errorMessage = pickReadableErrorMessage(msg, responseData);
      message.error(errorMessage);
    }),
  );

  return client;
}

export const requestClient = createRequestClient(appendApiPrefix(apiURL), {
  responseReturn: 'data',
});

export const baseRequestClient = new RequestClient({ baseURL: apiURL });

export const apiRequestClient = createRequestClient(appendApiPrefix(apiURL), {
  responseReturn: 'data',
});
