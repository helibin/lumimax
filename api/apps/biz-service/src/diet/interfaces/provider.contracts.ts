export interface IdentifyFoodInput {
  imageUrl?: string;
  imageBase64?: string;
  locale?: string;
  countryCode?: string;
  prompt?: string;
  requestId?: string;
}

export interface FoodVisionResult {
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

export interface SearchFoodInput {
  query: string;
  locale?: string;
  countryCode?: string;
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
