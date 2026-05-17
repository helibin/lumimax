import { getDefaultMarket } from '../../config/default-market';

export const DIET_MARKET_VALUES = ['CN', 'US'] as const;

export type DietMarket = (typeof DIET_MARKET_VALUES)[number];

const DIET_MARKET_SET = new Set<string>(DIET_MARKET_VALUES);

export function getDefaultDietMarket(): DietMarket {
  const configuredMarket = getDefaultMarket();
  return normalizeDietMarket(configuredMarket) ?? 'US';
}

export function resolveDietMarket(market?: string): DietMarket {
  const normalizedMarket = market?.trim().toUpperCase();
  if (normalizedMarket && DIET_MARKET_SET.has(normalizedMarket)) {
    return normalizedMarket as DietMarket;
  }
  return getDefaultDietMarket();
}

export function tryResolveDietMarket(market?: string): DietMarket | undefined {
  const normalizedMarket = market?.trim().toUpperCase();
  if (normalizedMarket && DIET_MARKET_SET.has(normalizedMarket)) {
    return normalizedMarket as DietMarket;
  }
  return getDefaultDietMarket();
}

export function normalizeDietMarket(market?: string): DietMarket | undefined {
  const normalizedMarket = market?.trim().toUpperCase();
  if (normalizedMarket && DIET_MARKET_SET.has(normalizedMarket)) {
    return normalizedMarket as DietMarket;
  }
  return undefined;
}
