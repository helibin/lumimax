import { getDefaultMarket } from '../../config/default-market';

export const DIET_MARKET_PROFILES = {
  CN: {
    localePrefixes: ['zh-cn', 'zh-hans'],
  },
  US: {
    localePrefixes: ['en-us'],
  },
} as const;

export type DietMarket = keyof typeof DIET_MARKET_PROFILES;

export const DIET_MARKET_VALUES = Object.keys(DIET_MARKET_PROFILES) as DietMarket[];

export function getDefaultDietMarket(): DietMarket {
  const configuredMarket = getDefaultMarket();
  return normalizeDietMarket(configuredMarket) ?? 'US';
}

export function resolveDietMarket(market?: string, locale?: string): DietMarket {
  const normalizedMarket = market?.trim().toUpperCase();
  if (normalizedMarket && normalizedMarket in DIET_MARKET_PROFILES) {
    return normalizedMarket as DietMarket;
  }
  return getDefaultDietMarket();
}

export function tryResolveDietMarket(market?: string, locale?: string): DietMarket | undefined {
  const normalizedMarket = market?.trim().toUpperCase();
  if (normalizedMarket && normalizedMarket in DIET_MARKET_PROFILES) {
    return normalizedMarket as DietMarket;
  }
  return getDefaultDietMarket();
}

export function normalizeDietMarket(market?: string): DietMarket | undefined {
  const normalizedMarket = market?.trim().toUpperCase();
  if (normalizedMarket && normalizedMarket in DIET_MARKET_PROFILES) {
    return normalizedMarket as DietMarket;
  }
  return undefined;
}
