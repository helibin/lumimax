import { getEnvString } from '@lumimax/config';

export const FALLBACK_DEFAULT_MARKET = 'US';

export function getDefaultMarket(): string {
  return getEnvString('DEFAULT_MARKET', FALLBACK_DEFAULT_MARKET)!.trim().toUpperCase() || FALLBACK_DEFAULT_MARKET;
}
