/*
 * @Author: Lybeen
 * @Email: helibin@139.com
 * @Date: 2026-05-12 04:07:51
 * @LastEditTime: 2026-05-12 05:12:42
 * @LastEditors: Lybeen
 * @FilePath: /@ai/lumimax/api/apps/biz-service/src/config/default-locale.ts
 */
import { getEnvString } from '@lumimax/config';

export const FALLBACK_DEFAULT_LOCALE = 'en-US';

export function getDefaultLocale(): string {
  return getEnvString('DEFAULT_LOCALE', FALLBACK_DEFAULT_LOCALE)!.trim() || FALLBACK_DEFAULT_LOCALE;
}
