import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppLogger } from '@lumimax/logger';
import type { Repository } from 'typeorm';
import { ILike, In } from 'typeorm';
import { FoodEntity, FoodNutritionEntity } from '../../common/entities/biz.entities';
import { FoodIdentityService } from '../food/food-identity.service';
import { FoodKnowledgeService } from '../food/food-knowledge.service';
import { UserFoodProfileService } from '../food/user-food-profile.service';
import type { NutritionCandidate } from '../interfaces/diet-center.contracts';
import type { NamedNutritionDataProvider } from '../interfaces/provider.contracts';
import { NutritionEstimatorFactory } from '../providers/estimator/nutrition-estimator.factory';
import { NutritionDataProviderFactory } from '../providers/nutrition-data-provider.factory';
import { NutritionCalculator } from './nutrition-calculator';
import { NutritionProviderRouterService } from './nutrition-provider-router.service';
import { NutritionRankingService } from './nutrition-ranking.service';

@Injectable()
export class NutritionService {
  constructor(
    @Inject(AppLogger) private readonly logger: AppLogger,
    @InjectRepository(FoodEntity)
    private readonly foodRepository: Repository<FoodEntity>,
    @InjectRepository(FoodNutritionEntity)
    private readonly foodNutritionRepository: Repository<FoodNutritionEntity>,
    @Inject(FoodIdentityService) private readonly foodIdentityService: FoodIdentityService,
    @Inject(FoodKnowledgeService) private readonly foodKnowledgeService: FoodKnowledgeService,
    @Inject(UserFoodProfileService)
    private readonly userFoodProfileService: UserFoodProfileService,
    @Inject(NutritionDataProviderFactory)
    private readonly nutritionDataProviderFactory: NutritionDataProviderFactory,
    @Inject(NutritionEstimatorFactory)
    private readonly nutritionEstimatorFactory: NutritionEstimatorFactory,
    @Inject(NutritionProviderRouterService)
    private readonly nutritionProviderRouter: NutritionProviderRouterService,
    @Inject(NutritionRankingService)
    private readonly nutritionRankingService: NutritionRankingService,
    @Inject(NutritionCalculator) private readonly nutritionCalculator: NutritionCalculator,
  ) {}

  async resolveNutrition(input: {
    foodName: string;
    candidateNames?: string[];
    userId?: string;
    tenantId: string;
    weightGram: number;
    locale?: string;
    market?: string;
    countryCode?: string;
    barcode?: string;
    inputType?: 'food' | 'barcode' | 'text' | 'image';
    requestId: string;
    imageConfidence?: number;
  }): Promise<{
    foodName: string;
    canonicalName: string;
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    source: string;
    provider: string;
    recognitionStatus: 'success' | 'fallback';
    verifiedLevel: string;
    routing: Record<string, unknown>;
    candidates: Array<Record<string, unknown>>;
  }> {
    const queryNames = this.buildQueryNames(input);
    const plan = this.nutritionProviderRouter.resolvePlan({
      market: input.market,
      locale: input.locale,
      hasBarcode: input.inputType === 'barcode' || Boolean(input.barcode?.trim()),
      hasImage: input.inputType === 'image',
      hasText: input.inputType === 'text',
      isRecipe: false,
    });
    const providerNames = this.nutritionDataProviderFactory.resolveEnabledNames(plan.providerNames);
    this.logger.log(
      `nutrition resolve start requestId=${input.requestId} food=${input.foodName} weightGram=${input.weightGram} route=${plan.routeKey} providers=${providerNames.join(',') || 'none'} queryNames=${queryNames.join('|')}`,
    );

    let ranked = this.nutritionRankingService.rankCandidates(
      await this.resolveFromUserCommonFoods(input, queryNames),
      {
        queryNames,
        imageConfidence: input.imageConfidence,
      },
    );
    if (ranked.length > 0) {
      this.logger.log(
        `营养解析命中用户沉淀 requestId=${input.requestId} matchedFood=${ranked[0]?.foodName ?? input.foodName} candidateCount=${ranked.length}`,
      );
    } else {
      const providerCandidates = await this.resolveFromProviders(providerNames, queryNames, input);
      if (providerCandidates.length > 0) {
        ranked = this.nutritionRankingService.rankCandidates(providerCandidates, {
          queryNames,
          imageConfidence: input.imageConfidence,
        });
      } else {
        ranked = [await this.resolveFromEstimator(input, queryNames)];
      }
    }

    const selected = ranked[0]!;
    await this.cacheResolvedFood(selected, input);
    this.logger.log(
      `nutrition resolve selected requestId=${input.requestId} provider=${selected.provider} matchedBy=${selected.matchedBy} verifiedLevel=${selected.verifiedLevel} canonicalName=${selected.canonicalName} candidateCount=${ranked.length} calories=${selected.calories}`,
    );

    return {
      foodName: selected.foodName,
      canonicalName: selected.canonicalName,
      calories: selected.calories,
      protein: selected.protein,
      fat: selected.fat,
      carbs: selected.carbs,
      source: selected.source,
      provider: selected.provider,
      recognitionStatus: selected.matchedBy === 'llm_estimated' ? 'fallback' : 'success',
      verifiedLevel: selected.verifiedLevel,
      routing: {
        routeKey: plan.routeKey,
        market: plan.market,
        providerNames,
        queryNames,
      },
      candidates: ranked.slice(0, 5).map((candidate) => this.toPublicCandidate(candidate)),
    };
  }

  private buildQueryNames(input: {
    foodName: string;
    candidateNames?: string[];
    locale?: string;
  }): string[] {
    const seedNames = [input.foodName, ...(input.candidateNames ?? [])];
    const expanded = seedNames.flatMap((name) =>
      this.foodIdentityService.buildSearchTerms({
        name,
        locale: input.locale,
      }),
    );
    return dedupeStrings(expanded).slice(0, 6);
  }

  private async resolveFromUserCommonFoods(
    input: {
      userId?: string;
      tenantId: string;
      weightGram: number;
    },
    queryNames: string[],
  ): Promise<NutritionCandidate[]> {
    const commonFoods = await this.userFoodProfileService.findCommonFoods({
      userId: input.userId,
      tenantId: input.tenantId,
      queryNames,
      limit: 5,
    });

    return commonFoods.map((entry) => {
      const scaled = this.nutritionCalculator.scalePer100g({
        weightGram: input.weightGram,
        caloriesPer100g: entry.caloriesPer100g,
        proteinPer100g: entry.proteinPer100g,
        fatPer100g: entry.fatPer100g,
        carbsPer100g: entry.carbsPer100g,
      });
      return {
        foodName: entry.foodName,
        canonicalName: entry.canonicalName,
        normalizedName: entry.normalizedName,
        provider: 'user_common' as const,
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
        raw: {
          usageCount: entry.usageCount,
          defaultWeightGram: entry.defaultWeightGram,
          lastUsedAt: entry.lastUsedAt,
        },
      };
    }).filter((candidate) => candidate.confidence && candidate.confidence > 0.7);
  }

  private async lookupLocalFoods(
    queryNames: string[],
    input: {
      tenantId: string;
      weightGram: number;
      locale?: string;
      countryCode?: string;
    },
  ): Promise<NutritionCandidate[]> {
    const collected = new Map<string, NutritionCandidate>();
    const knowledgeFoodIds = await this.foodKnowledgeService.findFoodIdsByNames({
      tenantId: input.tenantId,
      queryNames,
    });

    for (const queryName of queryNames.slice(0, 4)) {
      const food =
        await this.foodRepository.findOne({
          where: { tenantId: input.tenantId, name: ILike(queryName.trim()) },
        })
        ?? await this.foodRepository.findOne({
          where: { tenantId: input.tenantId, name: ILike(`%${queryName.trim()}%`) },
        });
      if (!food) {
        continue;
      }
      const nutrition = await this.foodNutritionRepository.findOne({
        where: { tenantId: input.tenantId, foodId: food.id },
      });
      if (!nutrition) {
        continue;
      }

      const identity = this.foodIdentityService.buildIdentity({
        name: food.name,
        locale: input.locale,
        countryCode: input.countryCode ?? food.countryCode ?? undefined,
        sourceType: 'internal',
      });
      const scaled = this.nutritionCalculator.scalePer100g({
        weightGram: input.weightGram,
        caloriesPer100g: Number(nutrition.caloriesPer100g ?? 0),
        proteinPer100g: Number(nutrition.proteinPer100g ?? 0),
        fatPer100g: Number(nutrition.fatPer100g ?? 0),
        carbsPer100g: Number(nutrition.carbsPer100g ?? 0),
      });

      collected.set(identity.normalizedName, {
        foodName: food.name,
        canonicalName: identity.canonicalName,
        normalizedName: identity.normalizedName,
        provider: 'local-db',
        source: food.source ?? 'local-db',
        matchedBy: 'internal',
        verifiedLevel: 'verified',
        caloriesPer100g: Number(nutrition.caloriesPer100g ?? 0),
        proteinPer100g: Number(nutrition.proteinPer100g ?? 0),
        fatPer100g: Number(nutrition.fatPer100g ?? 0),
        carbsPer100g: Number(nutrition.carbsPer100g ?? 0),
        calories: scaled.calories,
        protein: scaled.protein,
        fat: scaled.fat,
        carbs: scaled.carbs,
        rawCountryCode: food.countryCode ?? undefined,
        raw: {
          foodId: food.id,
          extra: nutrition.extraJson ?? {},
        },
      });
    }

    if (knowledgeFoodIds.length > 0) {
      const foods = await this.foodRepository.find({
        where: { id: In(knowledgeFoodIds.slice(0, 20)) },
      });
      for (const food of foods) {
        if (collected.has(this.foodIdentityService.normalizeName(food.name))) {
          continue;
        }
        const nutrition = await this.foodNutritionRepository.findOne({
          where: { foodId: food.id },
        });
        if (!nutrition) {
          continue;
        }
        const identity = this.foodIdentityService.buildIdentity({
          name: food.name,
          locale: input.locale,
          countryCode: input.countryCode ?? food.countryCode ?? undefined,
          sourceType: 'internal',
        });
        const scaled = this.nutritionCalculator.scalePer100g({
          weightGram: input.weightGram,
          caloriesPer100g: Number(nutrition.caloriesPer100g ?? 0),
          proteinPer100g: Number(nutrition.proteinPer100g ?? 0),
          fatPer100g: Number(nutrition.fatPer100g ?? 0),
          carbsPer100g: Number(nutrition.carbsPer100g ?? 0),
        });
        collected.set(identity.normalizedName, {
          foodName: food.name,
          canonicalName: identity.canonicalName,
          normalizedName: identity.normalizedName,
          provider: 'local-db',
          source: food.source ?? 'local-db',
          matchedBy: 'internal',
          verifiedLevel: 'verified',
          caloriesPer100g: Number(nutrition.caloriesPer100g ?? 0),
          proteinPer100g: Number(nutrition.proteinPer100g ?? 0),
          fatPer100g: Number(nutrition.fatPer100g ?? 0),
          carbsPer100g: Number(nutrition.carbsPer100g ?? 0),
          calories: scaled.calories,
          protein: scaled.protein,
          fat: scaled.fat,
          carbs: scaled.carbs,
          rawCountryCode: food.countryCode ?? undefined,
          raw: {
            foodId: food.id,
            fromKnowledge: true,
            extra: nutrition.extraJson ?? {},
          },
        });
      }
    }

    return [...collected.values()];
  }

  private async resolveFromProviders(
    providerNames: string[],
    queryNames: string[],
    input: {
      weightGram: number;
      locale?: string;
      countryCode?: string;
      barcode?: string;
      requestId: string;
    },
  ): Promise<NutritionCandidate[]> {
    const resolved: NutritionCandidate[] = [];
    if (providerNames.length === 0) {
      this.logger.warn(
        `营养第三方已跳过 requestId=${input.requestId} 原因=无可用数据源 queryCount=${queryNames.length}`,
      );
      return resolved;
    }

    for (const providerName of providerNames) {
      let providerEntry: NamedNutritionDataProvider;
      try {
        providerEntry = {
          name: providerName,
          provider: this.nutritionDataProviderFactory.resolve(providerName),
        };
        this.logger.log(
          `营养第三方开始请求 requestId=${input.requestId} provider=${providerName} queryCount=${queryNames.length}`,
        );
      } catch (error) {
        this.logger.warn(
          `营养第三方已跳过 requestId=${input.requestId} provider=${providerName} 原因=数据源不可用 detail=${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }

      const primaryQuery = queryNames;
      const candidate = await this.resolveFromProvider(providerEntry, primaryQuery, input);
      if (candidate) {
        this.logger.log(
          `营养第三方已命中 requestId=${input.requestId} provider=${providerName} matchedFood=${candidate.foodName} matchedBy=${candidate.matchedBy} caloriesPer100g=${candidate.caloriesPer100g} 已停止后续数据源`,
        );
        return [candidate];
      }
      this.logger.warn(
        `营养第三方未命中 requestId=${input.requestId} provider=${providerName} queryCount=${primaryQuery.length}`,
      );
    }

    return resolved;
  }

  private async resolveFromProvider(
    providerEntry: NamedNutritionDataProvider,
    queryNames: string[],
    input: {
      weightGram: number;
      locale?: string;
      countryCode?: string;
      requestId: string;
    },
  ): Promise<NutritionCandidate | null> {
    for (const queryName of queryNames) {
      try {
        const search = await providerEntry.provider.searchFood({
          query: queryName,
          locale: input.locale,
          countryCode: input.countryCode,
          requestId: input.requestId,
        });
        const match = search.items[0];
        if (!match) {
          continue;
        }
        const per100g = await providerEntry.provider.getNutrition({
          id: match.id,
          query: match.name || queryName,
          weightGram: 100,
          requestId: input.requestId,
        });
        const identity = this.foodIdentityService.buildIdentity({
          name: per100g.name || queryName,
          locale: input.locale,
          countryCode: input.countryCode,
          aliases: [queryName, match.name],
          sourceType: 'provider',
        });
        const displayFoodName = pickLocalizedFoodName({
          locale: input.locale,
          fallbackName: per100g.name || queryName,
          queryName,
          aliases: identity.aliases,
          raw: {
            searchMatch: match.raw,
            nutrition: per100g.raw,
          },
        });
        const scaled = this.nutritionCalculator.scalePer100g({
          weightGram: input.weightGram,
          caloriesPer100g: per100g.calories,
          proteinPer100g: per100g.protein,
          fatPer100g: per100g.fat,
          carbsPer100g: per100g.carbs,
        });
        return {
          foodName: displayFoodName,
          canonicalName: identity.canonicalName,
          normalizedName: identity.normalizedName,
          provider: providerEntry.name,
          source: per100g.source,
          matchedBy: isBarcodeQuery(queryName) ? 'barcode' : 'provider',
          verifiedLevel: 'verified',
          caloriesPer100g: round(per100g.calories),
          proteinPer100g: round(per100g.protein),
          fatPer100g: round(per100g.fat),
          carbsPer100g: round(per100g.carbs),
          calories: scaled.calories,
          protein: scaled.protein,
          fat: scaled.fat,
          carbs: scaled.carbs,
          brandName: match.brandName,
          rawCountryCode: input.countryCode,
          raw: {
            searchMatch: match.raw,
            nutrition: per100g.raw,
          },
        };
      } catch (error) {
        this.logger.warn(
          `nutrition provider ${providerEntry.name} failed for requestId=${input.requestId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return null;
  }

  private async resolveFromEstimator(
    input: {
      foodName: string;
      weightGram: number;
      locale?: string;
      countryCode?: string;
      requestId: string;
    },
    queryNames: string[],
  ): Promise<NutritionCandidate> {
    try {
      this.logger.log(
        `nutrition estimator start requestId=${input.requestId} food=${input.foodName} weightGram=${input.weightGram}`,
      );
      const estimate = await this.nutritionEstimatorFactory.resolve().estimate({
        foodName: input.foodName,
        weightGram: input.weightGram,
        locale: input.locale,
        countryCode: input.countryCode,
        requestId: input.requestId,
      });
      const identity = this.foodIdentityService.buildIdentity({
        name: estimate.name || input.foodName,
        locale: input.locale,
        countryCode: input.countryCode,
        aliases: queryNames,
        sourceType: 'llm_estimated',
      });
      return {
        foodName: estimate.name || input.foodName,
        canonicalName: identity.canonicalName,
        normalizedName: identity.normalizedName,
        provider: 'llm_estimator',
        source: estimate.source,
        matchedBy: 'llm_estimated',
        verifiedLevel: 'estimated',
        caloriesPer100g: round(scaleBackToPer100g(estimate.calories, input.weightGram)),
        proteinPer100g: round(scaleBackToPer100g(estimate.protein, input.weightGram)),
        fatPer100g: round(scaleBackToPer100g(estimate.fat, input.weightGram)),
        carbsPer100g: round(scaleBackToPer100g(estimate.carbs, input.weightGram)),
        calories: round(estimate.calories),
        protein: round(estimate.protein),
        fat: round(estimate.fat),
        carbs: round(estimate.carbs),
        confidence: estimate.confidence,
        rawCountryCode: input.countryCode,
        raw: estimate.raw,
      };
    } catch (error) {
      this.logger.warn(
        `nutrition estimator failed for requestId=${input.requestId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    this.logger.warn(
      `nutrition fallback catalog requestId=${input.requestId} food=${input.foodName} weightGram=${input.weightGram}`,
    );
    return fallbackNutrition(input.foodName, input.weightGram, this.foodIdentityService);
  }

  private async cacheResolvedFood(
    selected: NutritionCandidate,
    input: {
      tenantId: string;
      countryCode?: string;
      locale?: string;
      requestId: string;
    },
  ): Promise<void> {
    const existing =
      await this.foodRepository.findOne({
        where: { tenantId: input.tenantId, name: ILike(selected.foodName) },
      });
    const food = await this.foodRepository.save(
      this.foodRepository.create({
        id: existing?.id,
        tenantId: input.tenantId,
        name: selected.foodName,
        brand: selected.brandName ?? existing?.brand ?? null,
        countryCode: input.countryCode ?? existing?.countryCode ?? null,
        source: selected.source,
        status: existing?.status ?? 'active',
      }),
    );
    const nutrition = await this.foodNutritionRepository.findOne({
      where: { tenantId: input.tenantId, foodId: food.id },
    });
    await this.foodNutritionRepository.save(
      this.foodNutritionRepository.create({
        id: nutrition?.id,
        tenantId: input.tenantId,
        foodId: food.id,
        caloriesPer100g: toDecimalString(selected.caloriesPer100g),
        proteinPer100g: toDecimalString(selected.proteinPer100g),
        fatPer100g: toDecimalString(selected.fatPer100g),
        carbsPer100g: toDecimalString(selected.carbsPer100g),
        extraJson: {
          ...(nutrition?.extraJson ?? {}),
          canonicalName: selected.canonicalName,
          normalizedName: selected.normalizedName,
          verifiedLevel: selected.verifiedLevel,
          matchedBy: selected.matchedBy,
          provider: selected.provider,
          locale: input.locale ?? null,
          sourceCountryCode: input.countryCode ?? null,
          sourceTrace: buildSourceTrace(selected),
        },
      }),
    );
    const aliases = dedupeStrings([
      selected.foodName,
      selected.canonicalName,
      ...extractAliases(selected.raw),
    ]);
    await this.foodKnowledgeService.syncFoodIdentity({
      food,
      tenantId: input.tenantId,
      locale: input.locale,
      countryCode: input.countryCode,
      aliases,
      requestId: input.requestId,
    });
    await this.foodKnowledgeService.syncExternalMapping({
      foodId: food.id,
      tenantId: input.tenantId,
      providerCode: selected.provider,
      externalFoodId: extractExternalFoodId(selected.raw),
      externalName: selected.foodName,
      locale: input.locale,
      countryCode: input.countryCode,
      confidence: selected.score ?? selected.confidence ?? 0.8,
      rawPayload: selected.raw,
      requestId: input.requestId,
    });
  }

  private toPublicCandidate(candidate: NutritionCandidate): Record<string, unknown> {
    return {
      foodName: candidate.foodName,
      canonicalName: candidate.canonicalName,
      provider: candidate.provider,
      source: candidate.source,
      matchedBy: candidate.matchedBy,
      verifiedLevel: candidate.verifiedLevel,
      calories: candidate.calories,
      protein: candidate.protein,
      fat: candidate.fat,
      carbs: candidate.carbs,
      caloriesPer100g: candidate.caloriesPer100g,
      proteinPer100g: candidate.proteinPer100g,
      fatPer100g: candidate.fatPer100g,
      carbsPer100g: candidate.carbsPer100g,
      score: candidate.score ?? null,
      confidence: candidate.confidence ?? null,
      reasonCodes: candidate.reasonCodes ?? [],
      brandName: candidate.brandName ?? null,
    };
  }
}

function buildSourceTrace(selected: NutritionCandidate): Record<string, unknown> {
  const rawPayload = sanitizeJsonValue(selected.raw) ?? null;
  const rawPayloadJson = rawPayload ? stableJsonStringify(rawPayload) : null;
  return {
    provider: selected.provider,
    source: selected.source,
    matchedBy: selected.matchedBy,
    verifiedLevel: selected.verifiedLevel,
    externalFoodId: extractExternalFoodId(selected.raw),
    rawPayload,
    rawPayloadHash: rawPayloadJson ? sha256(rawPayloadJson) : null,
    cachedAt: new Date().toISOString(),
  };
}

function sanitizeJsonValue(value: unknown): Record<string, unknown> | unknown[] | string | number | boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeJsonValue(item)]),
    );
  }
  return String(value);
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortJsonValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function fallbackNutrition(
  foodName: string,
  weightGram: number,
  foodIdentityService: FoodIdentityService,
): NutritionCandidate {
  const catalog = [
    { name: 'apple', caloriesPer100g: 52, proteinPer100g: 0.3, fatPer100g: 0.2, carbsPer100g: 14 },
    { name: 'chicken breast', caloriesPer100g: 165, proteinPer100g: 31, fatPer100g: 3.6, carbsPer100g: 0 },
    { name: 'steamed white rice', caloriesPer100g: 116, proteinPer100g: 2.6, fatPer100g: 0.3, carbsPer100g: 25.9 },
  ];
  const matched =
    catalog.find((item) => foodName.toLowerCase().includes(item.name.split(' ')[0]))
    ?? catalog[0];
  const identity = foodIdentityService.buildIdentity({
    name: matched.name,
    aliases: [foodName],
    sourceType: 'llm_estimated',
  });
  const ratio = Math.max(weightGram, 1) / 100;
  return {
    foodName: foodName || matched.name,
    canonicalName: identity.canonicalName,
    normalizedName: identity.normalizedName,
    provider: 'fallback-catalog',
    source: 'fallback-catalog',
    matchedBy: 'llm_estimated',
    verifiedLevel: 'estimated',
    caloriesPer100g: matched.caloriesPer100g,
    proteinPer100g: matched.proteinPer100g,
    fatPer100g: matched.fatPer100g,
    carbsPer100g: matched.carbsPer100g,
    calories: round(matched.caloriesPer100g * ratio),
    protein: round(matched.proteinPer100g * ratio),
    fat: round(matched.fatPer100g * ratio),
    carbs: round(matched.carbsPer100g * ratio),
    confidence: 0.35,
  };
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

function isBarcodeQuery(value: string): boolean {
  return /^\d{8,14}$/.test(value.trim());
}

function extractAliases(raw?: Record<string, unknown>): string[] {
  if (!raw) {
    return [];
  }
  const items: string[] = [];
  const searchMatch = isRecord(raw.searchMatch) ? raw.searchMatch : undefined;
  const nutrition = isRecord(raw.nutrition) ? raw.nutrition : undefined;
  for (const candidate of [
    searchMatch?.name,
    searchMatch?.food_name,
    searchMatch?.product_name,
    nutrition?.name,
    nutrition?.label,
  ]) {
    if (typeof candidate === 'string' && candidate.trim()) {
      items.push(candidate.trim());
    }
  }
  return dedupeStrings(items);
}

function extractExternalFoodId(raw?: Record<string, unknown>): string | undefined {
  if (!raw) {
    return undefined;
  }
  const searchMatch = isRecord(raw.searchMatch) ? raw.searchMatch : undefined;
  for (const candidate of [
    searchMatch?.id,
    searchMatch?.foodId,
    searchMatch?.fdcId,
    searchMatch?.code,
    searchMatch?.nix_item_id,
  ]) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }
  return undefined;
}

export function pickLocalizedFoodName(input: {
  locale?: string;
  fallbackName: string;
  queryName?: string;
  aliases?: string[];
  raw?: Record<string, unknown>;
}): string {
  const fallbackName = input.fallbackName.trim();
  const language = normalizeLocaleLanguage(input.locale);
  if (!language) {
    return fallbackName;
  }

  const localizedFromRaw = pickLocalizedNameFromRaw(input.raw, language);
  if (localizedFromRaw) {
    return localizedFromRaw;
  }

  if (language === 'zh') {
    const localizedAlias = [input.queryName, ...(input.aliases ?? [])].find((item) => containsHanText(item));
    if (localizedAlias?.trim()) {
      return localizedAlias.trim();
    }
  }

  return fallbackName;
}

function scaleBackToPer100g(value: number, weightGram: number): number {
  const safeWeight = Math.max(weightGram, 1);
  return value / safeWeight * 100;
}

function pickLocalizedNameFromRaw(
  raw: Record<string, unknown> | undefined,
  language: string,
): string | undefined {
  if (!raw) {
    return undefined;
  }
  const candidates = [asRecord(raw.searchMatch), asRecord(raw.nutrition)];
  const suffixes = localizedFieldSuffixes(language);
  const baseFields = ['product_name', 'generic_name', 'name', 'label'];

  for (const record of candidates) {
    for (const field of baseFields) {
      for (const suffix of suffixes) {
        const value = pickString(record[`${field}_${suffix}`]);
        if (value) {
          return value;
        }
      }
    }
  }
  return undefined;
}

function localizedFieldSuffixes(language: string): string[] {
  switch (language) {
    case 'zh':
      return ['zh_cn', 'zh_hans', 'zh'];
    default:
      return [language];
  }
}

function normalizeLocaleLanguage(locale?: string): string | undefined {
  const normalized = locale?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return normalized.split(/[-_]/)[0] || undefined;
}

function containsHanText(value: string | undefined): boolean {
  return typeof value === 'string' && /[\p{Script=Han}]/u.test(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function toDecimalString(value: number): string {
  return round(value).toFixed(2);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
