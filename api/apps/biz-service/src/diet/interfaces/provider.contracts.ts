export interface IdentifyFoodInput {
  imageUrl?: string;
  imageBase64?: string;
  locale?: string;
  countryCode?: string;
  prompt?: string;
  requestId?: string;
}

export type ImageInputType =
  | 'food_photo'
  | 'packaged_food_front'
  | 'nutrition_label'
  | 'barcode_or_qr'
  | 'menu_or_receipt'
  | 'mixed'
  | 'unknown';

export interface FoodVisionResult {
  imageType?: ImageInputType;
  items: Array<{
    type?:
      | 'ingredient'
      | 'prepared_dish'
      | 'packaged_food'
      | 'restaurant_food'
      | 'mixed_meal'
      | 'unknown';
    name: string;
    displayName?: string;
    confidence?: number;
    count?: number;
    estimatedWeightGram?: number;
    children?: Array<{
      type?:
        | 'ingredient'
        | 'prepared_dish'
        | 'packaged_food'
        | 'restaurant_food'
        | 'mixed_meal'
        | 'unknown';
      name: string;
      displayName?: string;
      confidence?: number;
      count?: number;
      estimatedWeightGram?: number;
    }>;
  }>;
  raw?: Record<string, unknown>;
}

export interface NutritionLabelVisionResult {
  labelFound?: boolean;
  productName?: string;
  brandName?: string;
  servingSizeText?: string;
  servingWeightGram?: number;
  servingsPerContainer?: number;
  calories?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  fiber?: number;
  sodiumMg?: number;
  confidence?: number;
  raw?: Record<string, unknown>;
}

export interface SearchFoodInput {
  query: string;
  locale?: string;
  countryCode?: string;
  market?: string;
  alternateQueries?: string[];
  requestId?: string;
}

export interface NutritionSearchResult {
  items: Array<{
    id: string;
    name: string;
    brandName?: string;
    source: string;
    raw?: Record<string, unknown>;
  }>;
}

export interface GetNutritionInput {
  id?: string;
  query?: string;
  weightGram?: number;
  requestId?: string;
  locale?: string;
  countryCode?: string;
  market?: string;
  alternateQueries?: string[];
  /** searchFood 命中行，含 foodNutrients 时可免详情请求 */
  raw?: Record<string, unknown>;
  /** 同一次 search 的其它命中，用于详情 404 时复用，避免重复 search */
  searchHits?: Array<Record<string, unknown>>;
}

export interface NutritionResult {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber?: number;
  sodium?: number;
  source: string;
  raw?: Record<string, unknown>;
}

export interface EstimateNutritionInput {
  foodName: string;
  weightGram?: number;
  locale?: string;
  countryCode?: string;
  requestId?: string;
}

export interface NutritionEstimateResult extends NutritionResult {
  confidence?: number;
}

export interface FoodVisionProvider {
  identifyFood(input: IdentifyFoodInput): Promise<FoodVisionResult>;
  parseNutritionLabel?(input: IdentifyFoodInput): Promise<NutritionLabelVisionResult>;
}

export interface NamedFoodVisionProvider {
  name: string;
  provider: FoodVisionProvider;
}

export interface NutritionDataProvider {
  searchFood(input: SearchFoodInput): Promise<NutritionSearchResult>;
  getNutrition(input: GetNutritionInput): Promise<NutritionResult>;
}

export interface NamedNutritionDataProvider {
  name: string;
  provider: NutritionDataProvider;
}

export interface NutritionEstimatorProvider {
  estimate(input: EstimateNutritionInput): Promise<NutritionEstimateResult>;
}
