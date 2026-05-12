import type { ApplicationConfig, VbenAdminProAppConfigRaw } from '@lumimax/types/global';

/**
 * 由 vite-inject-app-config 注入的全局配置
 */
export function useAppConfig(env: Record<string, any>, isProduction: boolean): ApplicationConfig {
  // 生产环境依赖 _app.config.js 注入的 window._VBEN_ADMIN_PRO_APP_CONF_；若脚本 404 或未含字段，
  // VITE_GLOB_API_URL 会为 undefined，下游 appendApiPrefix(url).endsWith 会抛错。
  const config = (
    isProduction ? window._VBEN_ADMIN_PRO_APP_CONF_ : env
  ) as Partial<VbenAdminProAppConfigRaw> | undefined;

  const { VITE_GLOB_API_URL, VITE_GLOB_AUTH_DINGDING_CORP_ID, VITE_GLOB_AUTH_DINGDING_CLIENT_ID } =
    config ?? {};

  const applicationConfig: ApplicationConfig = {
    apiURL:
      typeof VITE_GLOB_API_URL === 'string' && VITE_GLOB_API_URL.length > 0
        ? VITE_GLOB_API_URL
        : '/',
    auth: {},
  };
  if (VITE_GLOB_AUTH_DINGDING_CORP_ID && VITE_GLOB_AUTH_DINGDING_CLIENT_ID) {
    applicationConfig.auth.dingding = {
      clientId: VITE_GLOB_AUTH_DINGDING_CLIENT_ID,
      corpId: VITE_GLOB_AUTH_DINGDING_CORP_ID,
    };
  }

  return applicationConfig;
}
