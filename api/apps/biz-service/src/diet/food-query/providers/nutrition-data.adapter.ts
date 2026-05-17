import type {
  FoodNutritionProvider,
  FoodQueryItem,
  FoodItemType,
  ProviderBarcodeInput,
  ProviderSearchInput,
  ProviderStatus,
  StandardFoodCandidate,
} from '../food-query.types';
import type {
  FoodVisionProvider,
  FoodVisionResult,
  NutritionDataProvider,
} from '../../interfaces/provider.contracts';
import { FoodIdentityService } from '../../food/food-identity.service';

export class NutritionDataProviderAdapter implements FoodNutritionProvider {
  constructor(
    readonly code: string,
    private readonly provider: NutritionDataProvider,
    private readonly foodIdentityService: FoodIdentityService,
    private readonly enabled: () => boolean,
  ) {}

  isEnabled(): boolean {
    return this.enabled();
  }

  getStatus(): ProviderStatus {
    return {
      code: this.code,
      enabled: this.isEnabled(),
      reason: this.isEnabled() ? undefined : 'disabled',
    };
  }

  async search(input: ProviderSearchInput): Promise<StandardFoodCandidate[]> {
    const search = await this.provider.searchFood({
      query: input.query,
      locale: input.locale,
      countryCode: input.countryCode,
      requestId: input.requestId,
    });
    return Promise.all(
      search.items.slice(0, 5).map((item) => this.mapSearchItem(item, input.query, input.requestId)),
    );
  }

  async searchByBarcode(input: ProviderBarcodeInput): Promise<StandardFoodCandidate[]> {
    if (!this.provider.searchFood) {
      return [];
    }
    const search = await this.provider.searchFood({
      query: input.barcode,
      locale: input.locale,
      countryCode: input.countryCode,
      requestId: input.requestId,
    });
    return Promise.all(
      search.items.slice(0, 3).map((item) =>
        this.mapSearchItem(item, input.barcode, input.requestId, 'packaged_food'),
      ),
    );
  }

  private async mapSearchItem(
    item: { id: string; name: string; brandName?: string; raw?: Record<string, unknown> },
    query: string,
    requestId: string,
    type: FoodItemType = 'ingredient',
  ): Promise<StandardFoodCandidate> {
    const nutrition = await this.provider.getNutrition({
      id: item.id,
      query: item.name || query,
      weightGram: 100,
      requestId,
    });
    const identity = this.foodIdentityService.buildIdentity({
      name: nutrition.name || item.name || query,
      aliases: [query, item.name],
      sourceType: 'provider',
    });
    return {
      sourceCode: this.code,
      externalFoodId: item.id,
      type,
      displayName: nutrition.name || item.name || query,
      normalizedName: identity.normalizedName,
      brandName: item.brandName,
      nutrientsPer100g: {
        caloriesKcal: round(nutrition.calories),
        proteinGram: round(nutrition.protein),
        fatGram: round(nutrition.fat),
        carbsGram: round(nutrition.carbs),
      },
      confidence: 0.75,
      verifiedLevel: 'provider_verified',
      rawPayload: {
        searchMatch: item.raw,
        nutrition: nutrition.raw,
      },
    };
  }
}

export class VisionProviderAdapter implements FoodNutritionProvider {
  constructor(
    readonly code: string,
    private readonly provider: FoodVisionProvider,
    private readonly foodIdentityService: FoodIdentityService,
    private readonly enabled: () => boolean,
  ) {}

  isEnabled(): boolean {
    return this.enabled();
  }

  getStatus(): ProviderStatus {
    return {
      code: this.code,
      enabled: this.isEnabled(),
    };
  }

  async search(): Promise<StandardFoodCandidate[]> {
    return [];
  }

  async recognizeImage(input: {
    imageUrl: string;
    locale?: string;
    countryCode?: string;
    requestId: string;
  }): Promise<FoodQueryItem[]> {
    const result = await this.provider.identifyFood(input);
    return result.items
      .map((item) => mapVisionItemToFoodQueryItem(item))
      .filter((item) => item.name.trim());
  }
}

type VisionFoodNode =
  | FoodVisionResult['items'][number]
  | NonNullable<FoodVisionResult['items'][number]['children']>[number];

function mapVisionItemToFoodQueryItem(item: VisionFoodNode): FoodQueryItem {
  const mapped: FoodQueryItem = {
    type: item.type ?? 'unknown',
    name: item.name,
    displayName: item.displayName ?? item.name,
    quantity: item.count,
    estimatedWeightGram: item.estimatedWeightGram,
    confidence: item.confidence ?? 0.5,
  };
  if ('children' in item && item.children?.length) {
    mapped.children = item.children.map(mapVisionItemToFoodQueryItem);
  }
  return mapped;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
