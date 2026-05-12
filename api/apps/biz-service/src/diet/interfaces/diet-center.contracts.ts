import type { DietMarket } from '../market/diet-market';

export interface FoodIdentityProfile {
  canonicalName: string;
  normalizedName: string;
  aliases: string[];
  locale?: string;
  countryCode?: string;
  sourceType:
    | 'vision'
    | 'user_common'
    | 'internal'
    | 'provider'
    | 'llm_estimated'
    | 'manual';
  verifiedLevel: 'confirmed' | 'verified' | 'estimated' | 'unverified';
}

export interface RecognitionCandidate {
  type?:
    | 'ingredient'
    | 'prepared_dish'
    | 'packaged_food'
    | 'restaurant_food'
    | 'mixed_meal'
    | 'unknown';
  name: string;
  displayName?: string;
  canonicalName: string;
  normalizedName: string;
  confidence: number;
  provider: string;
  source: string;
  count?: number;
  estimatedWeightGram?: number;
  children?: RecognitionCandidate[];
}

export interface FoodAnalysisItem {
  itemId: string;
  type:
    | 'ingredient'
    | 'prepared_dish'
    | 'packaged_food'
    | 'restaurant_food'
    | 'mixed_meal'
    | 'unknown';
  name: string;
  displayName: string;
  canonicalName: string;
  normalizedName: string;
  quantity?: number;
  measuredWeightGram?: number;
  estimatedWeightGram?: number;
  confidence: number;
  source: string;
  provider: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  children: FoodAnalysisItem[];
}

export interface FoodAnalysisConfirmationOption {
  optionId: string;
  foodName: string;
  displayName: string;
  canonicalName: string;
  source:
    | 'recognized'
    | 'user_common_selected'
    | 'system_search_selected'
    | 'retry_recognition_selected';
  provider: string;
  confidence?: number;
}

export interface EstimatedNutritionSummary {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  source?: string;
  provider?: string;
  verifiedLevel?: string;
}

export interface NutritionCandidate {
  foodName: string;
  canonicalName: string;
  normalizedName: string;
  provider: string;
  source: string;
  matchedBy:
    | 'user_common'
    | 'internal'
    | 'provider'
    | 'barcode'
    | 'recipe'
    | 'llm_estimated';
  verifiedLevel: 'confirmed' | 'verified' | 'estimated' | 'unverified';
  caloriesPer100g: number;
  proteinPer100g: number;
  fatPer100g: number;
  carbsPer100g: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  brandName?: string;
  rawCountryCode?: string;
  confidence?: number;
  score?: number;
  reasonCodes?: string[];
  raw?: Record<string, unknown>;
}

export interface DietProviderPlan {
  routeKey: string;
  market: DietMarket;
  sourceOrder: string[];
  providerNames: string[];
}
