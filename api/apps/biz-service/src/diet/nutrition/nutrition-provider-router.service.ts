import { Injectable } from '@nestjs/common';
import type { DietProviderPlan } from '../interfaces/diet-center.contracts';
import type { DietMarket } from '../market/diet-market';
import { resolveDietMarket } from '../market/diet-market';

type DietRouteFlow = 'barcode' | 'text' | 'image' | 'food';

const DIET_ROUTE_FLOW_ORDER: DietRouteFlow[] = ['image', 'text', 'barcode', 'food'];
export const DIET_ROUTE_MARKET_ORDER: DietMarket[] = ['CN', 'US'];

export const MARKET_ROUTE_PLANS: Record<DietMarket, Record<DietRouteFlow, Omit<DietProviderPlan, 'market'>>> = {
  CN: {
    barcode: {
      routeKey: 'cn-barcode',
      sourceOrder: ['user_common', 'internal', 'cn_barcode', 'nutrition_label_ocr', 'llm_estimated'],
      providerNames: ['boohee'],
    },
    text: {
      routeKey: 'cn-text',
      sourceOrder: ['user_common', 'internal', 'provider', 'llm_estimated'],
      providerNames: ['boohee', 'usda_fdc'],
    },
    image: {
      routeKey: 'cn-image',
      sourceOrder: ['user_common', 'internal', 'provider', 'llm_estimated'],
      providerNames: ['boohee', 'usda_fdc'],
    },
    food: {
      routeKey: 'cn-food',
      sourceOrder: ['user_common', 'internal', 'provider', 'llm_estimated'],
      providerNames: ['boohee', 'usda_fdc'],
    },
  },
  US: {
    barcode: {
      routeKey: 'us-barcode',
      sourceOrder: ['user_common', 'internal', 'provider', 'nutrition_label_ocr', 'llm_estimated'],
      providerNames: ['edamam'],
    },
    text: {
      routeKey: 'us-text',
      sourceOrder: ['user_common', 'internal', 'recipe', 'provider', 'llm_estimated'],
      providerNames: ['edamam', 'usda_fdc'],
    },
    image: {
      routeKey: 'us-image',
      sourceOrder: ['user_common', 'internal', 'provider', 'llm_estimated'],
      providerNames: ['usda_fdc', 'edamam'],
    },
    food: {
      routeKey: 'us-food',
      sourceOrder: ['user_common', 'internal', 'provider', 'llm_estimated'],
      providerNames: ['usda_fdc', 'edamam'],
    },
  },
};

export function listRouteProviderNamesForStartup(): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const market of DIET_ROUTE_MARKET_ORDER) {
    for (const flow of DIET_ROUTE_FLOW_ORDER) {
      for (const providerName of MARKET_ROUTE_PLANS[market][flow].providerNames) {
        if (seen.has(providerName)) {
          continue;
        }
        seen.add(providerName);
        ordered.push(providerName);
      }
    }
  }

  return ordered;
}

export function listRouteProviderNamesForMarket(market: DietMarket): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const flow of DIET_ROUTE_FLOW_ORDER) {
    for (const providerName of MARKET_ROUTE_PLANS[market][flow].providerNames) {
      if (seen.has(providerName)) {
        continue;
      }
      seen.add(providerName);
      ordered.push(providerName);
    }
  }

  return ordered;
}

@Injectable()
export class NutritionProviderRouterService {
  resolvePlan(input: {
    market?: string;
    locale?: string;
    hasBarcode?: boolean;
    hasImage?: boolean;
    hasText?: boolean;
    isRecipe?: boolean;
    foodType?: string;
  }): DietProviderPlan {
    const market = resolveDietMarket(input.market, input.locale);
    const flow = resolveRouteFlow(input);
    return {
      market,
      ...MARKET_ROUTE_PLANS[market][flow],
    };
  }
}

function resolveRouteFlow(input: {
  hasBarcode?: boolean;
  hasImage?: boolean;
  hasText?: boolean;
  isRecipe?: boolean;
}): DietRouteFlow {
  if (input.hasBarcode) {
    return 'barcode';
  }
  if (input.isRecipe || input.hasText) {
    return 'text';
  }
  if (input.hasImage) {
    return 'image';
  }
  return 'food';
}
