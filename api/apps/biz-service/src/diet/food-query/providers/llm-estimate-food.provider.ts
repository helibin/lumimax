import { Inject, Injectable } from '@nestjs/common';
import { getEnvString } from '@lumimax/config';
import { FoodIdentityService } from '../../food/food-identity.service';
import { NutritionEstimatorFactory } from '../../providers/estimator/nutrition-estimator.factory';
import type {
  FoodNutritionProvider,
  ProviderSearchInput,
  ProviderStatus,
  StandardFoodCandidate,
} from '../food-query.types';

@Injectable()
export class LlmEstimateFoodProvider implements FoodNutritionProvider {
  readonly code = 'llm_estimate';

  constructor(
    @Inject(NutritionEstimatorFactory)
    private readonly nutritionEstimatorFactory: NutritionEstimatorFactory,
    @Inject(FoodIdentityService) private readonly foodIdentityService: FoodIdentityService,
  ) {}

  isEnabled(): boolean {
    return getEnvString('FOOD_QUERY_ENABLE_LLM_FALLBACK', 'false')!.trim().toLowerCase() === 'true';
  }

  getStatus(): ProviderStatus {
    return {
      code: this.code,
      enabled: this.isEnabled(),
      reason: this.isEnabled() ? undefined : 'FOOD_QUERY_ENABLE_LLM_FALLBACK=false',
    };
  }

  async search(input: ProviderSearchInput): Promise<StandardFoodCandidate[]> {
    if (!this.isEnabled()) {
      return [];
    }
    try {
      const estimate = await this.nutritionEstimatorFactory.resolve().estimate({
        foodName: input.query,
        locale: input.locale,
        countryCode: input.countryCode,
        requestId: input.requestId,
      });
      const identity = this.foodIdentityService.buildIdentity({
        name: estimate.name || input.query,
        locale: input.locale,
        countryCode: input.countryCode,
        sourceType: 'llm_estimated',
      });
      const per100g = scaleBackToPer100g(
        {
          calories: estimate.calories,
          protein: estimate.protein,
          fat: estimate.fat,
          carbs: estimate.carbs,
        },
        100,
      );
      return [
        {
          sourceCode: this.code,
          type: 'unknown',
          displayName: estimate.name || input.query,
          normalizedName: identity.normalizedName,
          nutrientsPer100g: per100g,
          confidence: estimate.confidence ?? 0.35,
          verifiedLevel: 'unverified',
          rawPayload: estimate.raw,
        },
      ];
    } catch {
      return [];
    }
  }
}

function scaleBackToPer100g(
  values: { calories: number; protein: number; fat: number; carbs: number },
  weightGram: number,
): {
  caloriesKcal: number;
  proteinGram: number;
  fatGram: number;
  carbsGram: number;
} {
  const ratio = 100 / Math.max(weightGram, 1);
  return {
    caloriesKcal: round(values.calories * ratio),
    proteinGram: round(values.protein * ratio),
    fatGram: round(values.fat * ratio),
    carbsGram: round(values.carbs * ratio),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
