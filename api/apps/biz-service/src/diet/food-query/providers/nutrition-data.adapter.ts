import { getFoodQueryProviderStrongConfidence } from '../food-query-provider.config';
import { resolveProviderSearchQuery } from '../provider-search-query.util';
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
  ImageInputType,
  NutritionDataProvider,
} from '../../interfaces/provider.contracts';
import { FoodIdentityService } from '../../food/food-identity.service';
import { pickLocalizedFoodName } from '../../nutrition/nutrition-localization.util';

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
    const searchQuery = resolveProviderSearchQuery({
      query: input.query,
      alternateQueries: input.alternateQueries,
      role: 'primary',
      market: input.market,
      countryCode: input.countryCode,
      locale: input.locale,
    });
    const search = await this.provider.searchFood({
      query: searchQuery,
      locale: input.locale,
      countryCode: input.countryCode,
      market: input.market,
      alternateQueries: input.alternateQueries,
      requestId: input.requestId,
    });
    return this.resolveSearchItems(
      search.items,
      input.query,
      input.requestId,
      'ingredient',
      3,
      input,
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
    return this.resolveSearchItems(
      search.items,
      input.barcode,
      input.requestId,
      'packaged_food',
      2,
      {
        locale: input.locale,
        countryCode: input.countryCode,
        market: input.market,
      },
    );
  }

  private async resolveSearchItems(
    items: Array<{ id: string; name: string; brandName?: string; raw?: Record<string, unknown> }>,
    query: string,
    requestId: string,
    type: FoodItemType,
    maxLookups: number,
    context: Pick<ProviderSearchInput, 'locale' | 'countryCode' | 'market' | 'alternateQueries'>,
  ): Promise<StandardFoodCandidate[]> {
    const rankedItems = items
      .slice(0, 5)
      .map((item) => ({
        item,
        score: this.foodIdentityService.scoreNameMatch({
          queryNames: [query],
          targetName: item.name,
        }),
      }))
      .sort((left, right) => right.score - left.score);

    const searchHits = rankedItems
      .map(({ item }) => item.raw)
      .filter((raw): raw is Record<string, unknown> => Boolean(raw));

    const output: StandardFoodCandidate[] = [];
    const strongConfidence = getFoodQueryProviderStrongConfidence();
    for (const { item, score } of rankedItems.slice(0, maxLookups)) {
      const candidate = await this.mapSearchItem(
        item,
        query,
        requestId,
        type,
        context,
        score,
        searchHits,
      );
      output.push(candidate);
      if (isStrongProviderCandidate(candidate, strongConfidence)) {
        break;
      }
    }
    return output;
  }

  private async mapSearchItem(
    item: { id: string; name: string; brandName?: string; raw?: Record<string, unknown> },
    query: string,
    requestId: string,
    type: FoodItemType,
    context: Pick<ProviderSearchInput, 'locale' | 'countryCode' | 'market' | 'alternateQueries'>,
    nameScore?: number,
    searchHits: Array<Record<string, unknown>> = [],
  ): Promise<StandardFoodCandidate> {
    const nutrition = await this.provider.getNutrition({
      id: item.id,
      query,
      weightGram: 100,
      requestId,
      locale: context.locale,
      countryCode: context.countryCode,
      market: context.market,
      alternateQueries: context.alternateQueries,
      raw: item.raw,
      searchHits,
    });
    const fallbackName = nutrition.name || item.name || query;
    const displayName = pickLocalizedFoodName({
      locale: context.locale,
      fallbackName,
      queryName: query,
      aliases: [item.name],
      raw: {
        searchMatch: item.raw,
        nutrition: nutrition.raw,
      },
    });
    const identity = this.foodIdentityService.buildIdentity({
      name: displayName,
      aliases: [query, item.name, fallbackName],
      sourceType: 'provider',
    });
    return {
      sourceCode: this.code,
      externalFoodId: item.id,
      type,
      displayName,
      normalizedName: identity.normalizedName,
      brandName: item.brandName,
      nutrientsPer100g: {
        caloriesKcal: round(nutrition.calories),
        proteinGram: round(nutrition.protein),
        fatGram: round(nutrition.fat),
        carbsGram: round(nutrition.carbs),
      },
      confidence: roundConfidence(resolveProviderConfidence(nameScore ?? this.foodIdentityService.scoreNameMatch({
        queryNames: [query],
        targetName: displayName,
      }), nutrition)),
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
  }): Promise<{ imageType?: ImageInputType; items: FoodQueryItem[] }> {
    const result = await this.provider.identifyFood(input);
    return {
      imageType: result.imageType,
      items: result.items
        .map((item) => mapVisionItemToFoodQueryItem(item))
        .filter((item) => item.name.trim()),
    };
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

function resolveProviderConfidence(
  nameScore: number,
  nutrition: {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
  },
): number {
  const completenessBoost = hasCoreNutrition(nutrition) ? 0.08 : 0;
  return Math.max(0.55, Math.min(0.97, 0.62 + nameScore * 0.27 + completenessBoost));
}

function hasCoreNutrition(input: {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}): boolean {
  return input.calories > 0 || input.protein > 0 || input.fat > 0 || input.carbs > 0;
}

function isStrongProviderCandidate(
  candidate: StandardFoodCandidate,
  strongConfidence: number,
): boolean {
  return Boolean(
    candidate.nutrientsPer100g
    && hasCoreNutrition({
      calories: candidate.nutrientsPer100g.caloriesKcal,
      protein: candidate.nutrientsPer100g.proteinGram,
      fat: candidate.nutrientsPer100g.fatGram,
      carbs: candidate.nutrientsPer100g.carbsGram,
    })
    && candidate.confidence >= strongConfidence,
  );
}

function roundConfidence(value: number): number {
  return Math.round(value * 1000) / 1000;
}
