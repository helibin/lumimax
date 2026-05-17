import type { DietMarket } from '../market/diet-market';
import type { FoodQueryMarket } from './food-query.types';

export type ProviderSearchQueryRole = 'primary' | 'fallback';

/**
 * primary：首次 search，保留用户/识别主 query。
 * fallback：详情失败等二次 search，按市场偏好语种选词（如 US 优先英文名）。
 */
export function resolveProviderSearchQuery(input: {
  query: string;
  role: ProviderSearchQueryRole;
  market?: DietMarket | FoodQueryMarket | string;
  countryCode?: string;
  locale?: string;
  alternateQueries?: string[];
}): string {
  const candidates = dedupeQueries([input.query, ...(input.alternateQueries ?? [])]);
  const primary = candidates[0] ?? '';
  if (input.role === 'primary' || !primary) {
    return primary;
  }

  const market = resolveProviderMarket(input.market, input.countryCode, input.locale);
  if (market === 'CN') {
    return candidates.find(containsHanText) ?? primary;
  }
  if (market === 'US') {
    return candidates.find(isLatinSearchQuery) ?? candidates.find((item) => !containsHanText(item)) ?? primary;
  }
  return primary;
}

export function resolveProviderMarket(
  market?: DietMarket | FoodQueryMarket | string,
  countryCode?: string,
  locale?: string,
): DietMarket | undefined {
  const normalizedMarket = normalizeMarketToken(market);
  if (normalizedMarket === 'CN' || normalizedMarket === 'US') {
    return normalizedMarket;
  }
  const normalizedCountry = countryCode?.trim().toUpperCase();
  if (normalizedCountry === 'CN' || normalizedCountry === 'US') {
    return normalizedCountry;
  }
  const normalizedLocale = locale?.trim().toLowerCase() ?? '';
  if (
    normalizedLocale.endsWith('-cn')
    || normalizedLocale.startsWith('zh-cn')
    || normalizedLocale.startsWith('zh-hans')
    || normalizedLocale === 'zh'
  ) {
    return 'CN';
  }
  if (normalizedLocale.endsWith('-us') || normalizedLocale.startsWith('en-us')) {
    return 'US';
  }
  return undefined;
}

function normalizeMarketToken(market?: string): DietMarket | undefined {
  const lowered = market?.trim().toLowerCase();
  if (lowered === 'cn') {
    return 'CN';
  }
  if (lowered === 'us') {
    return 'US';
  }
  const upper = market?.trim().toUpperCase();
  if (upper === 'CN' || upper === 'US') {
    return upper;
  }
  return undefined;
}

function dedupeQueries(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(trimmed);
  }
  return output;
}

function containsHanText(value: string): boolean {
  return /[\p{Script=Han}]/u.test(value);
}

function isLatinSearchQuery(value: string): boolean {
  return /[A-Za-z]/.test(value) && !containsHanText(value);
}
