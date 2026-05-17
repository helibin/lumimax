import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '@lumimax/logger';
import { getEnvString } from '@lumimax/config';
import type { NutritionCandidate } from '../interfaces/diet-center.contracts';
import { FoodIdentityService } from '../food/food-identity.service';
import { UserFoodProfileService } from '../food/user-food-profile.service';
import { NutritionCalculator } from '../nutrition/nutrition-calculator';
import { NutritionRankingService } from '../nutrition/nutrition-ranking.service';
import { FoodProviderRegistry } from './food-provider-registry';
import { FoodQueryRouterService } from './food-query-router.service';
import type {
  FoodQueryInput,
  FoodQueryItem,
  FoodQueryResult,
  StandardFoodCandidate,
} from './food-query.types';
import { toFoodQueryMarket } from './food-query.types';

@Injectable()
export class FoodQueryService {
  constructor(
    @Inject(AppLogger) private readonly logger: AppLogger,
    @Inject(FoodIdentityService) private readonly foodIdentityService: FoodIdentityService,
    @Inject(UserFoodProfileService)
    private readonly userFoodProfileService: UserFoodProfileService,
    @Inject(FoodProviderRegistry) private readonly providerRegistry: FoodProviderRegistry,
    @Inject(FoodQueryRouterService) private readonly foodQueryRouter: FoodQueryRouterService,
    @Inject(NutritionCalculator) private readonly nutritionCalculator: NutritionCalculator,
    @Inject(NutritionRankingService) private readonly nutritionRankingService: NutritionRankingService,
  ) {}

  async query(input: FoodQueryInput): Promise<FoodQueryResult> {
    const market = input.market ?? toFoodQueryMarket(input.countryCode);
    const foodType = input.foodType ?? 'unknown';
    const weightGram = Math.max(1, input.weightGram ?? 100);
    const queryNames = this.buildQueryNames(input);
    const { routeKey, providerCodes } = this.foodQueryRouter.resolveExecutionChain({
      market,
      inputType: input.inputType,
      foodType,
      countryCode: input.countryCode,
      locale: input.locale,
      hasWeight: Boolean(input.weightGram),
      hasBarcode: Boolean(input.barcode?.trim()),
    });

    this.logger.log(
      `food-query start requestId=${input.requestId} route=${routeKey} providers=${providerCodes.join(',') || 'none'}`,
    );

    let queryItems: FoodQueryItem[] = [];
    let recognition: FoodQueryResult['recognition'];
    const candidates: StandardFoodCandidate[] = [];

    for (const providerCode of providerCodes) {
      const provider = this.providerRegistry.get(providerCode);
      if (!provider?.isEnabled()) {
        continue;
      }
      try {
        if (providerCode === 'vision' && input.imageUrl && provider.recognizeImage) {
          const items = await provider.recognizeImage({
            imageUrl: input.imageUrl,
            locale: input.locale,
            countryCode: input.countryCode,
            requestId: input.requestId,
          });
          if (items.length > 0) {
            queryItems = items;
            recognition = {
              provider: provider.code,
              confidence: items[0]?.confidence,
              status: 'success',
            };
          }
          continue;
        }

        if (providerCode === 'internal') {
          const internalCandidates = await provider.search({
            query: queryNames[0] ?? input.query ?? '',
            tenantId: input.tenantId,
            locale: input.locale,
            countryCode: input.countryCode,
            requestId: input.requestId,
          });
          candidates.push(...internalCandidates);
          if (internalCandidates.length > 0) {
            break;
          }
          continue;
        }

        if (input.barcode?.trim() && provider.searchByBarcode) {
          const barcodeCandidates = await provider.searchByBarcode({
            barcode: input.barcode.trim(),
            locale: input.locale,
            countryCode: input.countryCode,
            requestId: input.requestId,
          });
          candidates.push(...barcodeCandidates);
          if (barcodeCandidates.length > 0) {
            break;
          }
        }

        const searchCandidates = await provider.search({
          query: queryNames[0] ?? input.query ?? '',
          locale: input.locale,
          countryCode: input.countryCode,
          requestId: input.requestId,
        });
        if (searchCandidates.length > 0) {
          candidates.push(...searchCandidates);
          break;
        }
      } catch (error) {
        this.logger.warn(
          `food-query provider failed requestId=${input.requestId} provider=${providerCode} reason=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const userCommonCandidates = await this.resolveUserCommonCandidates(input, queryNames, weightGram);
    const rankedNutrition = this.nutritionRankingService.rankCandidates(
      [
        ...userCommonCandidates,
        ...candidates.map((candidate) => this.toNutritionCandidate(candidate, weightGram)),
      ],
      { queryNames, imageConfidence: recognition?.confidence },
    );

    const maxCandidates = Number(getEnvString('FOOD_QUERY_MAX_CANDIDATES', '5'));
    const normalizedCandidates = rankedNutrition
      .slice(0, maxCandidates)
      .map((candidate) => this.fromNutritionCandidate(candidate));

    const selected = normalizedCandidates[0];
    if (selected?.nutrientsPer100g) {
      const scaled = this.nutritionCalculator.scalePer100g({
        weightGram,
        caloriesPer100g: selected.nutrientsPer100g.caloriesKcal,
        proteinPer100g: selected.nutrientsPer100g.proteinGram,
        fatPer100g: selected.nutrientsPer100g.fatGram,
        carbsPer100g: selected.nutrientsPer100g.carbsGram,
      });
      selected.caloriesKcal = scaled.calories;
      selected.nutrientsPerServing = {
        caloriesKcal: scaled.calories,
        proteinGram: scaled.protein,
        fatGram: scaled.fat,
        carbsGram: scaled.carbs,
      };
    }

    if (!queryItems.length && (input.query || selected)) {
      queryItems = [
        {
          type: selected?.type ?? foodType,
          name: input.query ?? selected?.displayName ?? 'unknown',
          displayName: selected?.displayName,
          measuredWeightGram: input.weightGram,
          estimatedWeightGram: input.weightGram,
          confidence: selected?.confidence ?? 0.5,
        },
      ];
    }

    return {
      requestId: input.requestId,
      market,
      inputType: input.inputType,
      queryItems,
      candidates: normalizedCandidates,
      selected,
      routing: {
        routeKey,
        providerCodes,
        queryNames,
      },
      recognition: recognition ?? {
        provider: selected?.sourceCode ?? 'none',
        confidence: selected?.confidence,
        status: selected?.verifiedLevel === 'unverified' ? 'fallback' : 'success',
      },
    };
  }

  private buildQueryNames(input: FoodQueryInput): string[] {
    const seedNames = [input.query, ...(input.candidateNames ?? [])].filter(
      (item): item is string => Boolean(item?.trim()),
    );
    const expanded = seedNames.flatMap((name) =>
      this.foodIdentityService.buildSearchTerms({
        name,
        locale: input.locale,
      }),
    );
    return dedupeStrings(expanded).slice(0, 6);
  }

  private async resolveUserCommonCandidates(
    input: FoodQueryInput,
    queryNames: string[],
    weightGram: number,
  ): Promise<NutritionCandidate[]> {
    const commonFoods = await this.userFoodProfileService.findCommonFoods({
      userId: input.userId,
      tenantId: input.tenantId,
      queryNames,
      limit: 5,
    });
    return commonFoods
      .map((entry) => {
        const scaled = this.nutritionCalculator.scalePer100g({
          weightGram,
          caloriesPer100g: entry.caloriesPer100g,
          proteinPer100g: entry.proteinPer100g,
          fatPer100g: entry.fatPer100g,
          carbsPer100g: entry.carbsPer100g,
        });
        return {
          foodName: entry.foodName,
          canonicalName: entry.canonicalName,
          normalizedName: entry.normalizedName,
          provider: 'user_common',
          source: 'user-common-history',
          matchedBy: 'user_common' as const,
          verifiedLevel: 'confirmed' as const,
          caloriesPer100g: entry.caloriesPer100g,
          proteinPer100g: entry.proteinPer100g,
          fatPer100g: entry.fatPer100g,
          carbsPer100g: entry.carbsPer100g,
          calories: scaled.calories,
          protein: scaled.protein,
          fat: scaled.fat,
          carbs: scaled.carbs,
          confidence: entry.confidence,
          reasonCodes: ['user_common'],
        };
      })
      .filter((candidate) => (candidate.confidence ?? 0) > 0.7);
  }

  private toNutritionCandidate(
    candidate: StandardFoodCandidate,
    weightGram: number,
  ): NutritionCandidate {
    const per100g = candidate.nutrientsPer100g ?? {
      caloriesKcal: 0,
      proteinGram: 0,
      fatGram: 0,
      carbsGram: 0,
    };
    const scaled = this.nutritionCalculator.scalePer100g({
      weightGram,
      caloriesPer100g: per100g.caloriesKcal,
      proteinPer100g: per100g.proteinGram,
      fatPer100g: per100g.fatGram,
      carbsPer100g: per100g.carbsGram,
    });
    return {
      foodName: candidate.displayName,
      canonicalName: candidate.displayName,
      normalizedName: candidate.normalizedName,
      provider: candidate.sourceCode,
      source: candidate.sourceCode,
      matchedBy:
        candidate.sourceCode === 'internal'
          ? 'internal'
          : candidate.verifiedLevel === 'unverified'
            ? 'llm_estimated'
            : 'provider',
      verifiedLevel:
        candidate.verifiedLevel === 'unverified' || candidate.verifiedLevel === 'estimated'
          ? 'estimated'
          : 'verified',
      caloriesPer100g: per100g.caloriesKcal,
      proteinPer100g: per100g.proteinGram,
      fatPer100g: per100g.fatGram,
      carbsPer100g: per100g.carbsGram,
      calories: scaled.calories,
      protein: scaled.protein,
      fat: scaled.fat,
      carbs: scaled.carbs,
      confidence: candidate.confidence,
      raw: isRecord(candidate.rawPayload) ? candidate.rawPayload : undefined,
    };
  }

  private fromNutritionCandidate(candidate: NutritionCandidate): StandardFoodCandidate {
    return {
      sourceCode: candidate.provider,
      type: 'unknown',
      displayName: candidate.foodName,
      normalizedName: candidate.normalizedName,
      nutrientsPer100g: {
        caloriesKcal: candidate.caloriesPer100g,
        proteinGram: candidate.proteinPer100g,
        fatGram: candidate.fatPer100g,
        carbsGram: candidate.carbsPer100g,
      },
      caloriesKcal: candidate.calories,
      confidence: candidate.confidence ?? 0.5,
      verifiedLevel:
        candidate.verifiedLevel === 'estimated' ? 'unverified' : 'provider_verified',
      rawPayload: candidate.raw,
    };
  }
}

function dedupeStrings(values: string[]): string[] {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
