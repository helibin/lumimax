import type { DietMarket } from '../market/diet-market';

export type FoodQueryMarket = 'cn' | 'us' | 'global';

export type FoodQueryInputType =
  | 'manual_text'
  | 'voice_text'
  | 'barcode'
  | 'image'
  | 'ocr_nutrition_label'
  | 'provider_candidate';

export type FoodItemType =
  | 'ingredient'
  | 'prepared_dish'
  | 'packaged_food'
  | 'restaurant_food'
  | 'mixed_meal'
  | 'unknown';

export type FoodVerifiedLevel =
  | 'internal_verified'
  | 'provider_verified'
  | 'user_verified'
  | 'estimated'
  | 'unverified';

export interface FoodQueryInput {
  requestId: string;
  tenantId: string;
  userId?: string;
  deviceId?: string;
  mealId?: string;
  market: FoodQueryMarket;
  inputType: FoodQueryInputType;
  query?: string;
  candidateNames?: string[];
  barcode?: string;
  imageUrl?: string;
  imageKey?: string;
  ocrText?: string;
  weightGram?: number;
  locale?: string;
  countryCode?: string;
  foodType?: FoodItemType;
  options?: {
    enableLlmFallback?: boolean;
    enableOcr?: boolean;
    maxCandidates?: number;
  };
}

export interface FoodQueryItem {
  type: FoodItemType;
  name: string;
  displayName?: string;
  quantity?: number;
  estimatedWeightGram?: number;
  measuredWeightGram?: number;
  confidence: number;
  children?: FoodQueryItem[];
}

export interface NutritionPer100g {
  caloriesKcal: number;
  proteinGram: number;
  fatGram: number;
  carbsGram: number;
}

export interface NutritionSummary {
  caloriesKcal: number;
  proteinGram: number;
  fatGram: number;
  carbsGram: number;
}

export interface StandardFoodCandidate {
  sourceCode: string;
  externalFoodId?: string;
  internalFoodId?: string;
  type: FoodItemType;
  displayName: string;
  normalizedName: string;
  brandName?: string;
  barcode?: string;
  servingUnit?: string;
  servingWeightGram?: number;
  nutrientsPer100g?: NutritionPer100g;
  nutrientsPerServing?: NutritionSummary;
  caloriesKcal?: number;
  confidence: number;
  verifiedLevel: FoodVerifiedLevel;
  rawPayload?: unknown;
}

export interface FoodQueryResult {
  requestId: string;
  market: FoodQueryMarket;
  inputType: FoodQueryInputType;
  queryItems: FoodQueryItem[];
  candidates: StandardFoodCandidate[];
  selected?: StandardFoodCandidate;
  routing: {
    routeKey: string;
    providerCodes: string[];
    queryNames: string[];
  };
  recognition?: {
    provider: string;
    confidence?: number;
    status: 'success' | 'fallback';
  };
}

export interface ProviderRouteContext {
  market: FoodQueryMarket;
  inputType: FoodQueryInputType;
  foodType: FoodItemType;
  countryCode?: string;
  locale?: string;
  hasWeight?: boolean;
  hasBarcode?: boolean;
}

export interface ProviderRouteConfig {
  version: string;
  routes: Record<
    FoodQueryMarket,
    Record<string, string[]>
  >;
}

export interface ProviderStatus {
  code: string;
  enabled: boolean;
  reason?: string;
}

export interface ProviderSearchInput {
  query: string;
  tenantId?: string;
  locale?: string;
  countryCode?: string;
  requestId: string;
}

export interface ProviderBarcodeInput {
  barcode: string;
  locale?: string;
  countryCode?: string;
  requestId: string;
}

export interface FoodNutritionProvider {
  readonly code: string;
  isEnabled(): boolean;
  getStatus(): ProviderStatus;
  search(input: ProviderSearchInput): Promise<StandardFoodCandidate[]>;
  searchByBarcode?(input: ProviderBarcodeInput): Promise<StandardFoodCandidate[]>;
  recognizeImage?(input: {
    imageUrl: string;
    locale?: string;
    countryCode?: string;
    requestId: string;
  }): Promise<FoodQueryItem[]>;
}

export function toFoodQueryMarket(market?: string): FoodQueryMarket {
  const normalized = market?.trim().toUpperCase();
  if (normalized === 'CN') {
    return 'cn';
  }
  if (normalized === 'US') {
    return 'us';
  }
  return 'global';
}

export function fromFoodQueryMarket(market: FoodQueryMarket): DietMarket | undefined {
  switch (market) {
    case 'cn':
      return 'CN';
    case 'us':
      return 'US';
    default:
      return undefined;
  }
}
