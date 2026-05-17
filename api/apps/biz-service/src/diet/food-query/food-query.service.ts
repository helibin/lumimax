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
  FoodQueryProviderTrace,
  FoodQueryItem,
  FoodQueryResult,
  ProviderRouteContext,
  StandardFoodCandidate,
} from './food-query.types';
import {
  getFoodQueryAnalyzeNutritionMinConfidence,
  getFoodQueryProviderStrongConfidence,
} from './food-query-provider.config';
import { fromFoodQueryMarket, toFoodQueryMarket } from './food-query.types';

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
    const startedAt = Date.now();
    const market = input.market ?? toFoodQueryMarket(input.countryCode);
    const providerMarket = fromFoodQueryMarket(market);
    const foodType = input.foodType ?? 'unknown';
    const weightGram = Math.max(1, input.weightGram ?? 100);
    let queryNames = this.buildQueryNames(input);
    let routingContext: ProviderRouteContext = {
      market,
      inputType: input.inputType,
      foodType,
      imageType: input.imageType,
      countryCode: input.countryCode,
      locale: input.locale,
      hasWeight: Boolean(input.weightGram),
      hasBarcode: Boolean(input.barcode?.trim()),
    };
    let { routeKey, providerCodes } = this.foodQueryRouter.resolveExecutionChain(routingContext);

    this.logger.log(
      `food-query start requestId=${input.requestId} route=${routeKey} inputType=${input.inputType} hasBarcode=${Boolean(input.barcode?.trim())} providers=${providerCodes.join(',') || 'none'}`,
    );

    let queryItems: FoodQueryItem[] = [];
    let recognition: FoodQueryResult['recognition'];
    const candidates: StandardFoodCandidate[] = [];
    const providerTraces: FoodQueryProviderTrace[] = [];
    let skipNutritionLookup = false;

    for (let providerIndex = 0; providerIndex < providerCodes.length; providerIndex += 1) {
      const providerCode = providerCodes[providerIndex]!;
      const provider = this.providerRegistry.get(providerCode);
      if (!provider?.isEnabled()) {
        this.logger.log(
          `food-query provider skipped requestId=${input.requestId} provider=${providerCode} reason=disabled`,
        );
        continue;
      }
      const providerStartedAt = Date.now();
      let currentStage: FoodQueryProviderTrace['stage'] = 'search';
      let currentStageStartedAt = providerStartedAt;
      try {
        if (providerCode === 'vision' && input.imageUrl && provider.recognizeImage) {
          currentStage = 'recognize_image';
          currentStageStartedAt = Date.now();
          const recognized = await provider.recognizeImage({
            imageUrl: input.imageUrl,
            locale: input.locale,
            countryCode: input.countryCode,
            requestId: input.requestId,
          });
          const imageType = normalizePackagedImageType(recognized.imageType);
          const items = normalizeRecognizedItems(recognized.items, imageType);
          if (items.length > 0) {
            queryItems = items;
            const recognitionConfidence = items[0]?.confidence;
            recognition = {
              provider: provider.code,
              confidence: recognitionConfidence,
              status: 'success',
              imageType,
            };
            routingContext = {
              ...routingContext,
              foodType: resolveRecognizedFoodType(items, routingContext.foodType, imageType),
              imageType,
            };
            const rerouted = this.foodQueryRouter.resolveExecutionChain(routingContext);
            routeKey = rerouted.routeKey;
            providerCodes = rerouted.providerCodes.filter((code) => code !== 'vision');
            providerIndex = -1;
            queryNames = this.buildQueryNames({
              ...input,
              candidateNames: mergeCandidateNames(input.candidateNames, items),
            });
            skipNutritionLookup = shouldSkipAnalyzeNutritionLookup({
              inputType: input.inputType,
              recognitionConfidence,
            });
          }
          providerTraces.push({
            provider: provider.code,
            stage: currentStage,
            status: 'success',
            durationMs: Date.now() - currentStageStartedAt,
            imageType,
            itemCount: items.length,
            output: {
              imageType,
              items: sanitizeJson(items) as FoodQueryItem[],
            },
          });
          this.logger.log(
            `food-query provider done requestId=${input.requestId} provider=${providerCode} durationMs=${Date.now() - providerStartedAt} recognizedItems=${items.length} rerouted=${items.length > 0} recognitionConfidence=${items[0]?.confidence ?? 0}`,
          );
          if (skipNutritionLookup) {
            this.logger.log(
              `food-query nutrition skipped requestId=${input.requestId} reason=low_recognition_confidence confidence=${recognition?.confidence ?? 0} threshold=${getFoodQueryAnalyzeNutritionMinConfidence()}`,
            );
            break;
          }
          continue;
        }

        if (providerCode === 'internal') {
          currentStage = 'search';
          currentStageStartedAt = Date.now();
          const internalCandidates = await provider.search({
            query: queryNames[0] ?? input.query ?? '',
            alternateQueries: queryNames.slice(1),
            tenantId: input.tenantId,
            locale: input.locale,
            countryCode: input.countryCode,
            market: providerMarket,
            requestId: input.requestId,
            imageUrl: input.imageUrl,
            ocrText: input.ocrText,
            inputType: input.inputType,
            foodType: routingContext.foodType,
            imageType: routingContext.imageType,
          });
          candidates.push(...internalCandidates);
          const shouldStop = internalCandidates.length > 0;
          providerTraces.push(buildProviderCandidateTrace({
            provider: provider.code,
            stage: currentStage,
            stageStartedAt: currentStageStartedAt,
            candidates: internalCandidates,
            stop: shouldStop,
          }));
          this.logger.log(
            `food-query provider done requestId=${input.requestId} provider=${providerCode} durationMs=${Date.now() - providerStartedAt} candidates=${internalCandidates.length} stop=${shouldStop}`,
          );
          if (shouldStop) {
            break;
          }
          continue;
        }

        if (input.barcode?.trim() && provider.searchByBarcode) {
          currentStage = 'search_by_barcode';
          currentStageStartedAt = Date.now();
          const barcodeCandidates = await provider.searchByBarcode({
            barcode: input.barcode.trim(),
            locale: input.locale,
            countryCode: input.countryCode,
            market: providerMarket,
            requestId: input.requestId,
          });
          candidates.push(...barcodeCandidates);
          const shouldStop = this.shouldStopAfterCandidates(barcodeCandidates, queryNames);
          providerTraces.push(buildProviderCandidateTrace({
            provider: provider.code,
            stage: currentStage,
            stageStartedAt: currentStageStartedAt,
            candidates: barcodeCandidates,
            stop: shouldStop,
          }));
          this.logger.log(
            `food-query provider done requestId=${input.requestId} provider=${providerCode} durationMs=${Date.now() - providerStartedAt} barcodeCandidates=${barcodeCandidates.length} stop=${shouldStop}`,
          );
          if (shouldStop) {
            break;
          }
        }

        currentStage = 'search';
        currentStageStartedAt = Date.now();
        const searchCandidates = await provider.search({
          query: queryNames[0] ?? input.query ?? '',
          alternateQueries: queryNames.slice(1),
          locale: input.locale,
          countryCode: input.countryCode,
          market: providerMarket,
          requestId: input.requestId,
          imageUrl: input.imageUrl,
          ocrText: input.ocrText,
          inputType: input.inputType,
          foodType: routingContext.foodType,
          imageType: routingContext.imageType,
        });
        candidates.push(...searchCandidates);
        const shouldStop = this.shouldStopAfterCandidates(searchCandidates, queryNames);
        providerTraces.push(buildProviderCandidateTrace({
          provider: provider.code,
          stage: currentStage,
          stageStartedAt: currentStageStartedAt,
          candidates: searchCandidates,
          stop: shouldStop,
        }));
        this.logger.log(
          `food-query provider done requestId=${input.requestId} provider=${providerCode} durationMs=${Date.now() - providerStartedAt} candidates=${searchCandidates.length} stop=${shouldStop}`,
        );
        if (shouldStop) {
          break;
        }
      } catch (error) {
        providerTraces.push({
          provider: provider.code,
          stage: currentStage,
          status: 'error',
          durationMs: Date.now() - currentStageStartedAt,
          error: error instanceof Error ? error.message : String(error),
        });
        if (providerCode === 'vision' && input.inputType === 'image') {
          throw new Error(
            `food-query vision failed requestId=${input.requestId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        this.logger.warn(
          `food-query provider failed requestId=${input.requestId} provider=${providerCode} durationMs=${Date.now() - providerStartedAt} reason=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const userCommonCandidates = skipNutritionLookup
      ? []
      : await this.resolveUserCommonCandidates(input, queryNames, weightGram);
    const rankedNutrition = skipNutritionLookup
      ? []
      : this.nutritionRankingService.rankCandidates(
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

    if (!queryItems.length && normalizedCandidates.length === 0) {
      this.logger.warn(
        `food-query empty result requestId=${input.requestId} route=${routeKey} inputType=${input.inputType} hasBarcode=${Boolean(input.barcode?.trim())}`,
      );
    }

    this.logger.log(
      `food-query completed requestId=${input.requestId} route=${routeKey} durationMs=${Date.now() - startedAt} candidates=${normalizedCandidates.length} selectedProvider=${selected?.sourceCode ?? 'none'} selectedConfidence=${selected?.confidence ?? 0}`,
    );

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
        imageType: routingContext.imageType,
      },
      debug: {
        providerTraces,
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

  private shouldStopAfterCandidates(
    candidates: StandardFoodCandidate[],
    queryNames: string[],
  ): boolean {
    if (candidates.length === 0) {
      return false;
    }
    return candidates.some((candidate) => this.isHighConfidenceCandidate(candidate, queryNames));
  }

  private isHighConfidenceCandidate(
    candidate: StandardFoodCandidate,
    queryNames: string[],
  ): boolean {
    const nameScore = this.foodIdentityService.scoreNameMatch({
      queryNames,
      targetName: candidate.displayName,
      aliases: [candidate.normalizedName],
    });
    const hasCoreNutrition = Boolean(
      candidate.nutrientsPer100g
      && (
        candidate.nutrientsPer100g.caloriesKcal > 0
        || candidate.nutrientsPer100g.proteinGram > 0
        || candidate.nutrientsPer100g.fatGram > 0
        || candidate.nutrientsPer100g.carbsGram > 0
      ),
    );
    const strongConfidence = getFoodQueryProviderStrongConfidence();
    return hasCoreNutrition
      && candidate.verifiedLevel !== 'unverified'
      && (candidate.confidence >= strongConfidence || nameScore >= 0.92);
  }
}

function resolveRecognizedFoodType(
  items: FoodQueryItem[],
  fallback: FoodQueryItem['type'],
  imageType?: ProviderRouteContext['imageType'],
): FoodQueryItem['type'] {
  if (isPackagedImageType(imageType)) {
    return 'packaged_food';
  }
  const preferred = items.find((item) => item.type && item.type !== 'unknown')?.type;
  return preferred ?? fallback;
}

function normalizeRecognizedItems(
  items: FoodQueryItem[],
  imageType?: ProviderRouteContext['imageType'],
): FoodQueryItem[] {
  if (!isPackagedImageType(imageType)) {
    return items;
  }
  return items.map((item) => normalizePackagedRecognitionItem(item));
}

function normalizePackagedRecognitionItem(item: FoodQueryItem): FoodQueryItem {
  return {
    ...item,
    type: 'packaged_food',
    children: (item.children ?? []).map((child) => ({
      ...child,
      type: child.type === 'unknown' ? 'unknown' : 'packaged_food',
    })),
  };
}

function normalizePackagedImageType(
  imageType?: ProviderRouteContext['imageType'],
): ProviderRouteContext['imageType'] {
  return imageType;
}

function isPackagedImageType(imageType?: ProviderRouteContext['imageType']): boolean {
  return imageType === 'nutrition_label'
    || imageType === 'packaged_food_front'
    || imageType === 'barcode_or_qr';
}

function buildProviderCandidateTrace(input: {
  provider: string;
  stage: FoodQueryProviderTrace['stage'];
  stageStartedAt: number;
  candidates: StandardFoodCandidate[];
  stop: boolean;
}): FoodQueryProviderTrace {
  return {
    provider: input.provider,
    stage: input.stage,
    status: 'success',
    durationMs: Date.now() - input.stageStartedAt,
    candidateCount: input.candidates.length,
    stop: input.stop,
    output: {
      candidates: input.candidates
        .slice(0, 5)
        .map((candidate) => sanitizeJson(candidate) as Record<string, unknown>),
    },
  };
}

function sanitizeJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null));
}

function mergeCandidateNames(
  seedNames: string[] | undefined,
  items: FoodQueryItem[],
): string[] {
  const names = [
    ...(seedNames ?? []),
    ...items.flatMap((item) => [item.displayName, item.name]),
  ].filter((item): item is string => Boolean(item?.trim()));
  return dedupeStrings(names);
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

function shouldSkipAnalyzeNutritionLookup(input: {
  inputType: FoodQueryInput['inputType'];
  recognitionConfidence?: number;
}): boolean {
  if (input.inputType !== 'image') {
    return false;
  }
  return (input.recognitionConfidence ?? 0) < getFoodQueryAnalyzeNutritionMinConfidence();
}
