import type { DietMarket } from '../market/diet-market';
import type { FoodQueryMarket, ProviderRouteConfig } from './food-query.types';
import type { ImageInputType } from '../interfaces/provider.contracts';

export const DIET_ROUTE_MARKET_ORDER: DietMarket[] = ['CN', 'US'];

const ROUTE_FLOW_ORDER = ['default', 'ingredient', 'prepared_dish', 'packaged_food'] as const;

export const DEFAULT_ROUTE_CONFIG: ProviderRouteConfig = {
  version: 'v4',
  routes: {
    cn: {
      default: ['vision', 'internal', 'boohee', 'llm_estimate'],
      ingredient: ['vision', 'internal', 'boohee', 'llm_estimate'],
      prepared_dish: ['vision', 'internal', 'boohee', 'llm_estimate'],
      packaged_food: ['vision', 'internal', 'boohee', 'nutrition_label_ocr', 'llm_estimate'],
    },
    us: {
      default: ['vision', 'internal', 'usda', 'edamam', 'llm_estimate'],
      ingredient: ['vision', 'internal', 'usda', 'edamam', 'llm_estimate'],
      prepared_dish: ['vision', 'internal', 'edamam', 'usda', 'llm_estimate'],
      packaged_food: ['vision', 'internal', 'edamam', 'nutrition_label_ocr', 'llm_estimate'],
    },
    global: {
      default: ['vision', 'internal', 'llm_estimate'],
    },
  },
};

export function parseProviderRoutesYaml(content: string): ProviderRouteConfig | null {
  const routes: ProviderRouteConfig['routes'] = {
    cn: {},
    us: {},
    global: {},
  };
  let version = 'v4';
  let currentMarket: FoodQueryMarket | null = null;
  let currentRouteKey: string | null = null;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    if (line.startsWith('version:')) {
      version = line.split(':')[1]?.trim() ?? version;
      continue;
    }
    const marketMatch = line.match(/^(cn|us|global):\s*$/);
    if (marketMatch) {
      currentMarket = marketMatch[1] as FoodQueryMarket;
      currentRouteKey = null;
      continue;
    }
    const routeMatch = line.match(/^([a-z0-9_]+):\s*$/);
    if (routeMatch && currentMarket) {
      currentRouteKey = routeMatch[1]!;
      routes[currentMarket][currentRouteKey] = [];
      continue;
    }
    const providerMatch = line.match(/^-\s+([a-z0-9_]+)\s*$/);
    if (providerMatch && currentMarket && currentRouteKey) {
      routes[currentMarket][currentRouteKey]!.push(providerMatch[1]!);
    }
  }

  if (!routes.cn.default?.length && !routes.us.default?.length) {
    return null;
  }
  return { version, routes };
}

export function listRouteProviderNamesForMarket(market: DietMarket): string[] {
  const foodQueryMarket = market === 'CN' ? 'cn' : 'us';
  const marketRoutes = DEFAULT_ROUTE_CONFIG.routes[foodQueryMarket];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const flow of ROUTE_FLOW_ORDER) {
    for (const providerName of marketRoutes[flow] ?? []) {
      if (seen.has(providerName)) {
        continue;
      }
      seen.add(providerName);
      ordered.push(providerName);
    }
  }
  return ordered;
}

export function resolveRouteKey(input: {
  inputType: string;
  foodType?: string;
  imageType?: ImageInputType;
  hasBarcode?: boolean;
}): string {
  // 条码或营养成分表场景优先归到包装食品：
  // 1. 这样日志里不会只看到 default，排查更直观；
  // 2. 也能命中 packaged_food 专用 provider 顺序。
  if (input.hasBarcode || input.inputType === 'barcode') {
    return 'packaged_food';
  }
  // 视觉或上游若已经给出明确 foodType，就尊重该类型继续路由。
  if (input.foodType && input.foodType !== 'unknown') {
    return input.foodType;
  }
  if (
    input.imageType === 'nutrition_label'
    || input.imageType === 'packaged_food_front'
    || input.imageType === 'barcode_or_qr'
    || input.inputType === 'ocr_nutrition_label'
  ) {
    return 'packaged_food';
  }
  // 兜底才走 default，适用于普通图片识别或缺少先验信息的情况。
  return 'default';
}
