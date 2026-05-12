import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { generateId } from '@lumimax/runtime';
import type { Repository } from 'typeorm';
import {
  DeviceEntity,
  MealItemEntity,
  MealRecordEntity,
  RecognitionLogEntity,
} from '../../common/entities/biz.entities';
import { FoodAnalysisService } from '../food-analysis/food-analysis.service';
import { FoodKnowledgeService } from '../food/food-knowledge.service';
import type {
  FoodAnalysisConfirmationOption,
  FoodAnalysisItem,
  NutritionCandidate,
  RecognitionCandidate,
} from '../interfaces/diet-center.contracts';
import { NutritionService } from '../nutrition/nutrition.service';
import { resolveTenantId } from '../../common/tenant-scope.util';
import { getDefaultLocale } from '../../config/default-locale';
import { getDefaultDietMarket } from '../market/diet-market';

@Injectable()
export class DietApplicationService {
  constructor(
    @InjectRepository(MealRecordEntity)
    private readonly mealRecordRepository: Repository<MealRecordEntity>,
    @InjectRepository(DeviceEntity)
    private readonly deviceRepository: Repository<DeviceEntity>,
    @InjectRepository(MealItemEntity)
    private readonly mealItemRepository: Repository<MealItemEntity>,
    @InjectRepository(RecognitionLogEntity)
    private readonly recognitionLogRepository: Repository<RecognitionLogEntity>,
    @Inject(FoodAnalysisService) private readonly foodAnalysisService: FoodAnalysisService,
    @Inject(FoodKnowledgeService) private readonly foodKnowledgeService: FoodKnowledgeService,
    @Inject(NutritionService) private readonly nutritionService: NutritionService,
  ) {}

  async createMealRecord(input: {
    userId: string;
    deviceId: string;
    locale?: string;
    market?: string;
    requestId: string;
  }): Promise<Record<string, unknown>> {
    const device = await this.deviceRepository.findOne({
      where: { deviceSn: input.deviceId },
    });
    const dietContext = resolveDietContext({
      locale: input.locale,
      market: device?.market ?? input.market,
      defaultLocale: device?.locale ?? getDefaultLocale(),
      defaultMarket: device?.market ?? getDefaultDietMarket(),
    });
    const meal = await this.mealRecordRepository.save(
      this.mealRecordRepository.create({
        tenantId: device?.tenantId ?? resolveTenantId(),
        userId: input.userId,
        deviceId: input.deviceId,
        locale: dietContext.locale,
        market: dietContext.market,
        status: 'created',
        startedAt: new Date(),
        totalCalories: '0',
        totalWeight: '0',
      }),
    );
    return this.toMealReply(meal, input.requestId);
  }

  async analyzeFoodItem(input: {
    mealRecordId: string;
    userId: string;
    deviceId: string;
    imageKey: string;
    imageUrl?: string;
    imageObjectId?: string;
    weightGram: number;
    locale?: string;
    market?: string;
    requestId: string;
  }): Promise<Record<string, unknown>> {
    const meal = await this.assertMealReadyForAnalysis(input.mealRecordId, input.userId);
    const dietContext = resolveDietContext({
      locale: input.locale ?? meal.locale ?? undefined,
      market: input.market ?? meal.market ?? undefined,
      defaultLocale: getDefaultLocale(),
      defaultMarket: meal.market ?? getDefaultDietMarket(),
    });
    const countryCode = resolveCountryCode(dietContext);

    const startedAt = Date.now();
    meal.status = 'analyzing';
    meal.locale = dietContext.locale;
    meal.market = dietContext.market;
    const analysis = await this.foodAnalysisService.identifyFood({
      imageKey: input.imageKey,
      imageUrl: input.imageUrl,
      locale: dietContext.locale ?? undefined,
      countryCode,
      requestId: input.requestId,
    });
    const nutrition = await this.nutritionService.resolveNutrition({
      foodName: analysis.foodName,
      candidateNames: analysis.candidates.map((candidate) => candidate.name),
      userId: input.userId,
      tenantId: meal.tenantId,
      weightGram: input.weightGram,
      locale: dietContext.locale ?? undefined,
      market: dietContext.market ?? undefined,
      countryCode,
      inputType: 'image',
      requestId: input.requestId,
      imageConfidence: analysis.confidence,
    });
    const recognitionStatus =
      analysis.recognitionStatus === 'success' && nutrition.recognitionStatus === 'success'
        ? 'success'
        : 'fallback';
    const item = await this.mealItemRepository.save(
      this.mealItemRepository.create({
        tenantId: meal.tenantId,
        mealRecordId: meal.id,
        userId: input.userId,
        deviceId: input.deviceId,
        imageKey: input.imageKey,
        imageObjectId: input.imageObjectId ?? generateId(),
        foodName: nutrition.canonicalName || nutrition.foodName,
        weight: toDecimalString(input.weightGram),
        calories: toDecimalString(nutrition.calories),
        protein: toDecimalString(nutrition.protein),
        fat: toDecimalString(nutrition.fat),
        carbs: toDecimalString(nutrition.carbs),
        source: nutrition.source,
        recognitionStatus,
        locale: dietContext.locale,
        market: dietContext.market,
      }),
    );

    meal.totalCalories = toDecimalString(
      Number(meal.totalCalories ?? 0) + nutrition.calories,
    );
    meal.totalWeight = toDecimalString(
      Number(meal.totalWeight ?? 0) + input.weightGram,
    );
    await this.mealRecordRepository.save(meal);

    await this.recognitionLogRepository.save(
      this.recognitionLogRepository.create({
        tenantId: meal.tenantId,
        recognitionRequestId: input.requestId,
        mealId: meal.id,
        deviceId: input.deviceId,
        locale: dietContext.locale,
        market: dietContext.market,
        imageKey: input.imageKey,
        provider: `${analysis.provider}->${nutrition.provider}`,
        status: recognitionStatus,
        latencyMs: Date.now() - startedAt,
        requestPayloadJson: {
          mealRecordId: input.mealRecordId,
          imageKey: input.imageKey,
          imageObjectId: item.imageObjectId,
          weightGram: input.weightGram,
          locale: dietContext.locale,
          market: dietContext.market,
          countryCode,
        },
        responsePayloadJson: {
          itemId: item.id,
          mealRecordId: meal.id,
          foodName: item.foodName,
          identifiedName: analysis.foodName,
          calories: item.calories,
          protein: item.protein,
          fat: item.fat,
          carbs: item.carbs,
          analysis,
          nutrition,
        },
      }),
    );

    const analysisItems = buildAnalysisItems({
      itemId: item.id,
      weightGram: input.weightGram,
      recognitionCandidates: analysis.candidates,
      nutritionCandidates: asNutritionCandidates(nutrition.candidates),
    });
    const estimatedNutrition = {
      calories: Number(item.calories),
      protein: Number(item.protein),
      fat: Number(item.fat),
      carbs: Number(item.carbs),
      source: item.source,
      provider: nutrition.provider,
      verifiedLevel: nutrition.verifiedLevel,
    };
    const confirmationOptions = buildConfirmationOptions({
      analysisCandidates: analysis.candidates,
      nutritionCandidates: asNutritionCandidates(nutrition.candidates),
    });
    const requiresUserConfirmation = shouldRequireUserConfirmation({
      recognitionStatus,
      confidence: analysis.confidence,
      confirmationOptions,
    });

    return {
      requestId: input.requestId,
      mealRecordId: meal.id,
      itemId: item.id,
      imageKey: item.imageKey,
      imageObjectId: item.imageObjectId,
      items: analysisItems,
      estimatedNutrition,
      confirmationOptions,
      requiresUserConfirmation,
      recognition: {
        provider: analysis.provider,
        confidence: analysis.confidence ?? null,
        candidates: analysis.candidates,
      },
      nutrition: {
        provider: nutrition.provider,
        routing: nutrition.routing,
        candidates: nutrition.candidates,
      },
      mealTotal: {
        totalCalories: Number(meal.totalCalories),
        totalWeight: Number(meal.totalWeight),
        itemCount: await this.mealItemRepository.count({
          where: { mealRecordId: meal.id },
        }),
      },
    };
  }

  async confirmFoodItem(input: {
    mealRecordId: string;
    itemId: string;
    userId: string;
    foodName: string;
    selectedFoodId?: string;
    correctedCount?: number;
    confirmationSource?:
      | 'recognized'
      | 'user_common_selected'
      | 'system_search_selected'
      | 'retry_recognition_selected';
    weightGram?: number;
    locale?: string;
    market?: string;
    requestId: string;
  }): Promise<Record<string, unknown>> {
    const meal = await this.mustGetMealForUser(input.mealRecordId, input.userId);
    this.assertMealStatus(meal.status, ['created', 'analyzing']);

    const item = await this.mustGetMealItem(input.itemId, meal.id);
    const weightGram = Math.max(1, input.weightGram ?? Number(item.weight ?? 0));
    const dietContext = resolveDietContext({
      locale: input.locale ?? item.locale ?? meal.locale ?? undefined,
      market: input.market ?? item.market ?? meal.market ?? undefined,
      defaultLocale: getDefaultLocale(),
      defaultMarket: item.market ?? meal.market ?? getDefaultDietMarket(),
    });
    const countryCode = resolveCountryCode(dietContext);
    const previousTotals = {
      foodName: item.foodName,
      source: item.source ?? undefined,
      calories: Number(item.calories ?? 0),
      protein: Number(item.protein ?? 0),
      fat: Number(item.fat ?? 0),
      carbs: Number(item.carbs ?? 0),
      weight: Number(item.weight ?? 0),
    };
    const nutrition = await this.nutritionService.resolveNutrition({
      foodName: input.foodName,
      candidateNames: [input.foodName],
      userId: input.userId,
      tenantId: meal.tenantId,
      weightGram,
      locale: dietContext.locale ?? undefined,
      market: dietContext.market ?? undefined,
      countryCode,
      inputType: 'text',
      requestId: input.requestId,
    });

    item.foodName = nutrition.canonicalName || nutrition.foodName;
    item.weight = toDecimalString(weightGram);
    item.calories = toDecimalString(nutrition.calories);
    item.protein = toDecimalString(nutrition.protein);
    item.fat = toDecimalString(nutrition.fat);
    item.carbs = toDecimalString(nutrition.carbs);
    item.source = nutrition.source;
    item.recognitionStatus = 'confirmed';
    item.locale = dietContext.locale;
    item.market = dietContext.market;
    const savedItem = await this.mealItemRepository.save(item);

    meal.locale = dietContext.locale;
    meal.market = dietContext.market;
    meal.totalCalories = toDecimalString(
      Number(meal.totalCalories ?? 0) - previousTotals.calories + nutrition.calories,
    );
    meal.totalWeight = toDecimalString(
      Number(meal.totalWeight ?? 0) - previousTotals.weight + weightGram,
    );
    await this.mealRecordRepository.save(meal);

    await this.recognitionLogRepository.save(
      this.recognitionLogRepository.create({
        tenantId: meal.tenantId,
        recognitionRequestId: `${input.requestId}-confirm`,
        mealId: meal.id,
        deviceId: meal.deviceId,
        locale: dietContext.locale,
        market: dietContext.market,
        imageKey: item.imageKey,
        provider: `user-confirmation->${nutrition.provider}`,
        status: 'confirmed',
        latencyMs: 0,
        requestPayloadJson: {
          itemId: item.id,
          selectedFoodId: input.selectedFoodId,
          correctedCount: input.correctedCount,
          confirmationSource: input.confirmationSource ?? 'recognized',
          previousFoodName: previousTotals.foodName,
          previousWeightGram: previousTotals.weight,
          previousCalories: previousTotals.calories,
          confirmedFoodName: input.foodName,
          confirmedWeightGram: weightGram,
          locale: dietContext.locale,
          market: dietContext.market,
          countryCode,
        },
        responsePayloadJson: {
          itemId: savedItem.id,
          canonicalName: savedItem.foodName,
          nutritionCandidates: nutrition.candidates,
        },
      }),
    );
    await this.foodKnowledgeService.recordCorrection({
      userId: input.userId,
      tenantId: meal.tenantId,
      mealRecordId: meal.id,
      mealItemId: savedItem.id,
      originalFoodName: previousTotals.foodName,
      correctedFoodName: savedItem.foodName,
      originalWeightGram: previousTotals.weight,
      correctedWeightGram: weightGram,
      originalProviderCode: previousTotals.source,
      correctedProviderCode: nutrition.provider,
      correctionType: 'manual_confirm',
      extraJson: {
        selectedFoodId: input.selectedFoodId,
        correctedCount: input.correctedCount,
        confirmationSource: input.confirmationSource ?? 'recognized',
        countryCode,
        nutritionCandidates: nutrition.candidates,
      },
      requestId: input.requestId,
    });

    return {
      requestId: input.requestId,
      mealRecordId: meal.id,
      item: this.toMealItem(savedItem),
      nutrition: {
        provider: nutrition.provider,
        verifiedLevel: nutrition.verifiedLevel,
        candidates: nutrition.candidates,
      },
      confirmationSource: input.confirmationSource ?? 'recognized',
      selectedFoodId: input.selectedFoodId ?? null,
      mealTotal: {
        totalCalories: Number(meal.totalCalories),
        totalWeight: Number(meal.totalWeight),
      },
      locale: meal.locale,
      market: meal.market,
    };
  }

  async finishMealRecord(input: {
    mealRecordId: string;
    userId: string;
    requestId: string;
  }): Promise<Record<string, unknown>> {
    const meal = await this.assertMealReadyForAnalysis(input.mealRecordId, input.userId);
    meal.status = 'finished';
    meal.finishedAt = new Date();
    await this.mealRecordRepository.save(meal);
    const items = await this.mealItemRepository.find({
      where: { mealRecordId: meal.id },
      order: { createdAt: 'ASC' },
    });

    return {
      requestId: input.requestId,
      mealRecordId: meal.id,
      status: meal.status,
      startedAt: meal.startedAt?.toISOString() ?? null,
      finishedAt: meal.finishedAt?.toISOString() ?? null,
      total: {
        calories: Number(meal.totalCalories ?? 0),
        weight: Number(meal.totalWeight ?? 0),
        itemCount: items.length,
      },
      locale: meal.locale,
      market: meal.market,
      items: items.map((item) => this.toMealItem(item)),
    };
  }

  async listMealsByUser(input: {
    userId: string;
    page: number;
    pageSize: number;
  }): Promise<Record<string, unknown>> {
    const page = Math.max(1, Number(input.page ?? 1));
    const pageSize = Math.max(1, Number(input.pageSize ?? 20));
    const [meals, total] = await this.mealRecordRepository.findAndCount({
      where: { userId: input.userId },
      order: { startedAt: 'DESC', createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      items: meals.map((meal) => this.toMealUserItem(meal)),
      pagination: this.buildPagination(page, pageSize, total),
    };
  }

  async getMealByUser(input: {
    mealRecordId: string;
    userId: string;
  }): Promise<Record<string, unknown>> {
    const meal = await this.mustGetMealForUser(input.mealRecordId, input.userId);
    const items = await this.mealItemRepository.find({
      where: { mealRecordId: meal.id },
      order: { createdAt: 'ASC' },
    });

    return {
      ...this.toMealUserItem(meal),
      items: items.map((item) => this.toMealItem(item)),
    };
  }

  async callAdmin<T>(input: {
    service: 'meals';
    method: string;
    payload?: Record<string, unknown>;
  }): Promise<T> {
    const page = Math.max(1, Number(input.payload?.page ?? 1));
    const pageSize = Math.max(1, Number(input.payload?.pageSize ?? 20));

    switch (`${input.service}.${input.method}`) {
      case 'meals.ListMeals': {
        const [meals, total] = await this.mealRecordRepository.findAndCount({
          where: buildMealFilters(input.payload),
          order: { startedAt: 'DESC', createdAt: 'DESC' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        });
        return this.paginate<T>(
          meals.map((meal) => this.toMealAdminItem(meal)),
          page,
          pageSize,
          total,
        );
      }
      case 'meals.GetMeal': {
        const mealRecordId = String(input.payload?.id ?? input.payload?.mealRecordId ?? '').trim();
        const meal = await this.mustGetMeal(mealRecordId);
        const items = await this.mealItemRepository.find({
          where: { mealRecordId: meal.id },
          order: { createdAt: 'ASC' },
        });
        return {
          ...this.toMealAdminItem(meal),
          items: items.map((item) => this.toMealItem(item)),
        } as T;
      }
      case 'meals.ListMealItems': {
        const mealRecordId = String(input.payload?.id ?? input.payload?.mealRecordId ?? '').trim();
        if (!mealRecordId) {
          throw new Error('mealRecordId is required');
        }
        const items = await this.mealItemRepository.find({
          where: {
            mealRecordId,
            ...buildMealItemFilters(input.payload),
          },
          order: { createdAt: 'ASC' },
        });
        return this.paginate<T>(
          items.map((item) => this.toMealItem(item)),
          1,
          Math.max(items.length, 1),
          items.length,
        );
      }
      default:
        throw new Error(`Unsupported biz diet admin method: ${input.service}.${input.method}`);
    }
  }

  async assertMealReadyForAnalysis(
    mealRecordId: string,
    userId: string,
  ): Promise<MealRecordEntity> {
    const meal = await this.mustGetMealForUser(mealRecordId, userId);
    this.assertMealStatus(meal.status, ['created', 'analyzing']);
    return meal;
  }

  private async mustGetMeal(mealRecordId: string): Promise<MealRecordEntity> {
    const meal = await this.mealRecordRepository.findOne({
      where: { id: String(mealRecordId).trim() },
    });
    if (!meal) {
      throw new Error(`meal record not found: ${mealRecordId}`);
    }
    return meal;
  }

  private async mustGetMealForUser(
    mealRecordId: string,
    userId: string,
  ): Promise<MealRecordEntity> {
    const meal = await this.mustGetMeal(mealRecordId);
    if (meal.userId && meal.userId !== userId) {
      throw new Error(`meal record not found: ${mealRecordId}`);
    }
    return meal;
  }

  private async mustGetMealItem(
    itemId: string,
    mealRecordId: string,
  ): Promise<MealItemEntity> {
    const item = await this.mealItemRepository.findOne({
      where: { id: itemId.trim(), mealRecordId },
    });
    if (!item) {
      throw new Error(`meal item not found: ${itemId}`);
    }
    return item;
  }

  private assertMealStatus(status: string, allowed: string[]): void {
    if (allowed.includes(status)) {
      return;
    }
    if (status === 'finished') {
      throw new Error('meal record already finished');
    }
    throw new Error(`meal record status invalid: ${status}`);
  }

  private paginate<T>(
    items: Array<Record<string, unknown>>,
    page: number,
    pageSize: number,
    total: number,
  ): T {
    const pagination = this.buildPagination(page, pageSize, total);
    return {
      items,
      pagination,
    } as T;
  }

  private buildPagination(
    page: number,
    pageSize: number,
    total: number,
  ): Record<string, unknown> {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
      page,
      pageSize,
      total,
      totalPages,
      hasMore: page < totalPages,
    };
  }

  private toMealReply(meal: MealRecordEntity, requestId: string): Record<string, unknown> {
    return {
      requestId,
      mealRecordId: meal.id,
      status: meal.status,
      startedAt: meal.startedAt?.toISOString() ?? null,
      totalCalories: Number(meal.totalCalories ?? 0),
      totalWeight: Number(meal.totalWeight ?? 0),
      locale: meal.locale,
      market: meal.market,
    };
  }

  private toMealAdminItem(meal: MealRecordEntity): Record<string, unknown> {
    return {
      mealRecordId: meal.id,
      userId: meal.userId,
      deviceId: meal.deviceId,
      status: meal.status,
      startedAt: meal.startedAt?.toISOString() ?? null,
      finishedAt: meal.finishedAt?.toISOString() ?? null,
      totalCalories: Number(meal.totalCalories ?? 0),
      totalWeight: Number(meal.totalWeight ?? 0),
      locale: meal.locale,
      market: meal.market,
    };
  }

  private toMealUserItem(meal: MealRecordEntity): Record<string, unknown> {
    return {
      mealRecordId: meal.id,
      status: meal.status,
      deviceId: meal.deviceId,
      startedAt: meal.startedAt?.toISOString() ?? null,
      finishedAt: meal.finishedAt?.toISOString() ?? null,
      totalCalories: Number(meal.totalCalories ?? 0),
      totalWeight: Number(meal.totalWeight ?? 0),
    };
  }

  private toMealItem(item: MealItemEntity): Record<string, unknown> {
    return {
      itemId: item.id,
      mealRecordId: item.mealRecordId,
      foodName: item.foodName,
      weight: Number(item.weight),
      calories: Number(item.calories),
      protein: Number(item.protein),
      fat: Number(item.fat),
      carbs: Number(item.carbs),
      source: item.source,
      imageKey: item.imageKey,
      imageObjectId: item.imageObjectId,
      recognitionStatus: item.recognitionStatus,
      locale: item.locale,
      market: item.market,
      createdAt: item.createdAt.toISOString(),
    };
  }

}

function toDecimalString(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function resolveDietContext(input: {
  locale?: string;
  market?: string;
  defaultLocale?: string;
  defaultMarket?: string;
}): { locale: string | null; market: string | null } {
  const locale = pickString(input.locale) ?? pickString(input.defaultLocale) ?? null;
  const normalizedMarket = pickString(input.market)?.toUpperCase();
  if (normalizedMarket === 'CN' || normalizedMarket === 'US') {
    return {
      locale,
      market: normalizedMarket,
    };
  }
  const defaultMarket = pickString(input.defaultMarket)?.toUpperCase();
  if (defaultMarket === 'CN' || defaultMarket === 'US') {
    return { locale, market: defaultMarket };
  }
  return { locale, market: null };
}

function buildMealFilters(payload?: Record<string, unknown>): Record<string, unknown> | undefined {
  const locale = pickString(payload?.locale);
  const market = pickString(payload?.market)?.toUpperCase();
  if (!locale && !market) {
    return undefined;
  }
  return {
    ...(locale ? { locale } : {}),
    ...(market ? { market } : {}),
  };
}

function buildMealItemFilters(payload?: Record<string, unknown>): Record<string, unknown> {
  const locale = pickString(payload?.locale);
  const market = pickString(payload?.market)?.toUpperCase();
  return {
    ...(locale ? { locale } : {}),
    ...(market ? { market } : {}),
  };
}

function resolveCountryCode(input: {
  locale?: string | null;
  market?: string | null;
}): string | undefined {
  const normalizedMarket = pickString(input.market)?.toUpperCase();
  if (normalizedMarket === 'CN' || normalizedMarket === 'US') {
    return normalizedMarket;
  }
  const normalizedLocale = pickString(input.locale)?.toLowerCase() ?? '';
  if (
    normalizedLocale.endsWith('-cn')
    || normalizedLocale.startsWith('zh-cn')
    || normalizedLocale.startsWith('zh-hans')
  ) {
    return 'CN';
  }
  if (normalizedLocale.endsWith('-us') || normalizedLocale.startsWith('en-us')) {
    return 'US';
  }
  return undefined;
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function buildAnalysisItems(input: {
  itemId: string;
  weightGram: number;
  recognitionCandidates: RecognitionCandidate[];
  nutritionCandidates: NutritionCandidate[];
}): FoodAnalysisItem[] {
  const nutritionByName = new Map<string, NutritionCandidate>();
  for (const candidate of input.nutritionCandidates) {
    nutritionByName.set(candidate.normalizedName, candidate);
  }

  return input.recognitionCandidates.slice(0, 5).map((candidate, index) => {
    const matchedNutrition =
      nutritionByName.get(candidate.normalizedName) ?? input.nutritionCandidates[0];
    return {
      itemId: index === 0 ? input.itemId : `${input.itemId}:${index + 1}`,
      type: candidate.type ?? 'ingredient',
      name: candidate.name,
      displayName: candidate.displayName ?? candidate.name,
      canonicalName: candidate.canonicalName,
      normalizedName: candidate.normalizedName,
      quantity: normalizeQuantity(candidate.count),
      measuredWeightGram: index === 0 ? input.weightGram : undefined,
      estimatedWeightGram: input.weightGram,
      confidence: candidate.confidence,
      source: matchedNutrition?.source ?? candidate.source,
      provider: matchedNutrition?.provider ?? candidate.provider,
      calories: matchedNutrition?.calories ?? 0,
      protein: matchedNutrition?.protein ?? 0,
      fat: matchedNutrition?.fat ?? 0,
      carbs: matchedNutrition?.carbs ?? 0,
      children: (candidate.children ?? []).map((child, childIndex) => ({
        itemId: `${input.itemId}:${index + 1}:${childIndex + 1}`,
        type: child.type ?? 'ingredient',
        name: child.name,
        displayName: child.displayName ?? child.name,
        canonicalName: child.canonicalName,
        normalizedName: child.normalizedName,
        quantity: normalizeQuantity(child.count),
        estimatedWeightGram: child.estimatedWeightGram,
        confidence: child.confidence,
        source: child.source,
        provider: child.provider,
        calories: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
        children: [],
      })),
    };
  });
}

function buildConfirmationOptions(input: {
  analysisCandidates: RecognitionCandidate[];
  nutritionCandidates: NutritionCandidate[];
}): FoodAnalysisConfirmationOption[] {
  const options: FoodAnalysisConfirmationOption[] = [];
  const seen = new Set<string>();

  for (const candidate of input.analysisCandidates.slice(0, 3)) {
    pushConfirmationOption(options, seen, {
      optionId: `recognized:${candidate.normalizedName}`,
      foodName: candidate.name,
      displayName: candidate.displayName ?? candidate.name,
      canonicalName: candidate.canonicalName,
      source: 'recognized',
      provider: candidate.provider,
      confidence: candidate.confidence,
    });
  }

  for (const candidate of input.nutritionCandidates.slice(0, 5)) {
    pushConfirmationOption(options, seen, {
      optionId: `${candidate.matchedBy}:${candidate.normalizedName}`,
      foodName: candidate.foodName,
      displayName: candidate.foodName,
      canonicalName: candidate.canonicalName,
      source:
        candidate.matchedBy === 'user_common'
          ? 'user_common_selected'
          : 'system_search_selected',
      provider: candidate.provider,
      confidence: candidate.confidence,
    });
  }

  const retryCandidate = input.analysisCandidates[1];
  if (retryCandidate) {
    pushConfirmationOption(options, seen, {
      optionId: `retry:${retryCandidate.normalizedName}`,
      foodName: retryCandidate.name,
      displayName: retryCandidate.displayName ?? retryCandidate.name,
      canonicalName: retryCandidate.canonicalName,
      source: 'retry_recognition_selected',
      provider: retryCandidate.provider,
      confidence: retryCandidate.confidence,
    });
  }

  return options.slice(0, 6);
}

function pushConfirmationOption(
  options: FoodAnalysisConfirmationOption[],
  seen: Set<string>,
  option: FoodAnalysisConfirmationOption,
): void {
  const key = `${option.source}:${option.canonicalName.toLowerCase()}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  options.push(option);
}

function shouldRequireUserConfirmation(input: {
  recognitionStatus: 'success' | 'fallback';
  confidence?: number;
  confirmationOptions: FoodAnalysisConfirmationOption[];
}): boolean {
  if (input.recognitionStatus !== 'success') {
    return true;
  }
  if ((input.confidence ?? 0) < 0.75) {
    return true;
  }
  return input.confirmationOptions.length > 1;
}

function normalizeQuantity(value?: number): number | undefined {
  if (!Number.isFinite(value) || Number(value) <= 0) {
    return undefined;
  }
  return Math.round(Number(value));
}

function asNutritionCandidates(value: unknown): NutritionCandidate[] {
  return Array.isArray(value) ? (value as unknown as NutritionCandidate[]) : [];
}
