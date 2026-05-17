import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { ILike } from 'typeorm';
import { FoodEntity, FoodNutritionEntity } from '../../common/entities/biz.entities';
import { FoodIdentityService } from './food-identity.service';
import { UserFoodProfileService } from './user-food-profile.service';

@Injectable()
export class FoodService {
  constructor(
    @InjectRepository(FoodEntity)
    private readonly foodRepository: Repository<FoodEntity>,
    @InjectRepository(FoodNutritionEntity)
    private readonly foodNutritionRepository: Repository<FoodNutritionEntity>,
    @Inject(FoodIdentityService) private readonly foodIdentityService: FoodIdentityService,
    @Inject(UserFoodProfileService)
    private readonly userFoodProfileService: UserFoodProfileService,
  ) {}

  async suggestFoods(input: {
    userId?: string;
    tenantId: string;
    query: string;
    limit?: number;
    locale?: string;
    market?: string;
  }): Promise<Record<string, unknown>> {
    const query = input.query.trim();
    if (!query) {
      return { items: [] };
    }
    const queryNames = this.foodIdentityService.buildSearchTerms({
      name: query,
      locale: input.locale,
    });

    const userCommon = await this.userFoodProfileService.findCommonFoods({
      userId: input.userId,
      tenantId: input.tenantId,
      queryNames,
      limit: input.limit ?? 5,
    });
    const localFoods = await this.foodRepository.find({
      where: { tenantId: input.tenantId, name: ILike(`%${query}%`) },
      order: { createdAt: 'DESC' },
      take: Math.max(5, input.limit ?? 5),
    });
    const nutritionMap = await this.loadFoodNutritionMap(input.tenantId, localFoods.map((item) => item.id));

    const suggestions = dedupeByKey(
      [
        ...userCommon.map((entry) => ({
          name: entry.foodName,
          canonicalName: entry.canonicalName,
          source: 'user_common',
          confidence: entry.confidence,
          caloriesPer100g: entry.caloriesPer100g,
          proteinPer100g: entry.proteinPer100g,
          fatPer100g: entry.fatPer100g,
          carbsPer100g: entry.carbsPer100g,
        })),
        ...localFoods.map((food) => {
          const nutrition = nutritionMap.get(food.id) ?? null;
          const identity = this.foodIdentityService.buildIdentity({
            name: food.name,
            locale: input.locale,
            sourceType: 'internal',
          });
          return {
            name: food.name,
            canonicalName: identity.canonicalName,
            source: food.source ?? 'local-db',
            confidence: this.foodIdentityService.scoreNameMatch({
              queryNames,
              targetName: food.name,
              aliases: [identity.canonicalName],
            }),
            caloriesPer100g: Number(nutrition?.caloriesPer100g ?? 0),
            proteinPer100g: Number(nutrition?.proteinPer100g ?? 0),
            fatPer100g: Number(nutrition?.fatPer100g ?? 0),
            carbsPer100g: Number(nutrition?.carbsPer100g ?? 0),
          };
        }),
      ],
      (item) => `${item.canonicalName}::${item.source}`,
    )
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, Math.max(1, input.limit ?? 5));

    return { items: suggestions };
  }

  async callAdmin<T>(input: {
    method: string;
    payload?: Record<string, unknown>;
    tenantId: string;
    requestId: string;
  }): Promise<T> {
    const page = Math.max(1, Number(input.payload?.page ?? 1));
    const pageSize = Math.max(1, Number(input.payload?.pageSize ?? 20));

    switch (input.method) {
      case 'ListFoods': {
        const keyword = pickString(input.payload?.keyword);
        const [foods, total] = await this.foodRepository.findAndCount({
          where: keyword
            ? [
                { tenantId: input.tenantId, name: ILike(`%${keyword}%`) },
                { tenantId: input.tenantId, brand: ILike(`%${keyword}%`) },
              ]
            : { tenantId: input.tenantId },
          order: { createdAt: 'DESC' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        });
        const nutritionMap = await this.loadFoodNutritionMap(input.tenantId, foods.map((item) => item.id));
        return this.paginate<T>(
          foods.map((food) => this.toFoodAdminItem(food, nutritionMap.get(food.id) ?? null)),
          page,
          pageSize,
          total,
        );
      }
      case 'GetFood': {
        const foodId = String(input.payload?.id ?? '').trim();
        const food = await this.foodRepository.findOne({
          where: { tenantId: input.tenantId, id: foodId },
        });
        if (!food) {
          throw new Error(`food not found: ${foodId}`);
        }
        const nutrition = await this.foodNutritionRepository.findOne({
          where: { tenantId: input.tenantId, foodId },
        });
        return this.toFoodAdminItem(food, nutrition) as T;
      }
      case 'CreateFood': {
        const body = parseBodyPayload(input.payload?.body_json);
        return (await this.createFood(body, input.tenantId, input.requestId)) as T;
      }
      case 'UpdateFood': {
        const id = String(input.payload?.id ?? '').trim();
        const body = parseBodyPayload(input.payload?.body_json);
        return (await this.updateFood(id, body, input.tenantId, input.requestId)) as T;
      }
      case 'UpdateFoodStatus': {
        const id = String(input.payload?.id ?? '').trim();
        const body = parseBodyPayload(input.payload?.body_json);
        return (await this.updateFoodStatus(id, body, input.tenantId, input.requestId)) as T;
      }
      case 'ListUserCommonFoods': {
        const listed = await this.userFoodProfileService.listAdminUserCommonFoods({
          tenantId: input.tenantId,
          page,
          pageSize,
          keyword: pickString(input.payload?.keyword),
          userId: pickString(input.payload?.userId),
        });
        return this.paginate<T>(
          listed.items.map((item) => ({ ...item })),
          page,
          pageSize,
          listed.total,
        );
      }
      default:
        throw new Error(`Unsupported food admin method: ${input.method}`);
    }
  }

  private paginate<T>(
    items: Array<Record<string, unknown>>,
    page: number,
    pageSize: number,
    total: number,
  ): T {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    } as T;
  }

  private async loadFoodNutritionMap(
    tenantId: string,
    foodIds: string[],
  ): Promise<Map<string, FoodNutritionEntity>> {
    if (foodIds.length === 0) {
      return new Map();
    }
    const nutritions = await this.foodNutritionRepository.find({
      where: { tenantId },
    });
    return new Map(
      nutritions
        .filter((item) => foodIds.includes(item.foodId))
        .map((item) => [item.foodId, item] as const),
    );
  }

  private async createFood(
    body: Record<string, unknown>,
    tenantId: string,
    _requestId: string,
  ): Promise<Record<string, unknown>> {
    const name = pickString(body.name);
    if (!name) {
      throw new Error('food name is required');
    }
    const food = await this.foodRepository.save(
      this.foodRepository.create({
        tenantId,
        name,
        brand: pickString(body.brand) ?? null,
        countryCode: pickString(body.countryCode) ?? pickString(body.country_code) ?? null,
        source: pickString(body.source) ?? 'manual',
        status: pickString(body.status) ?? 'active',
      }),
    );
    const nutrition = await this.foodNutritionRepository.save(
      this.foodNutritionRepository.create({
        tenantId,
        foodId: food.id,
        caloriesPer100g: toDecimalString(pickNumber(body.caloriesPer100g) ?? 0),
        proteinPer100g: toDecimalString(pickNumber(body.proteinPer100g) ?? 0),
        fatPer100g: toDecimalString(pickNumber(body.fatPer100g) ?? 0),
        carbsPer100g: toDecimalString(pickNumber(body.carbsPer100g) ?? 0),
        extraJson: {
          sourceRefId: pickString(body.sourceRefId) ?? null,
          servingSize: pickNumber(body.servingSize) ?? 100,
          servingUnit: pickString(body.servingUnit) ?? 'g',
        },
      }),
    );
    return this.toFoodAdminItem(food, nutrition);
  }

  private async updateFood(
    id: string,
    body: Record<string, unknown>,
    tenantId: string,
    _requestId: string,
  ): Promise<Record<string, unknown>> {
    const food = await this.foodRepository.findOne({ where: { tenantId, id } });
    if (!food) {
      throw new Error(`food not found: ${id}`);
    }
    food.name = pickString(body.name) ?? food.name;
    if (Object.prototype.hasOwnProperty.call(body, 'brand')) {
      food.brand = pickString(body.brand) ?? null;
    }
    if (
      Object.prototype.hasOwnProperty.call(body, 'countryCode')
      || Object.prototype.hasOwnProperty.call(body, 'country_code')
    ) {
      food.countryCode = pickString(body.countryCode) ?? pickString(body.country_code) ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'source')) {
      food.source = pickString(body.source) ?? null;
    }
    const savedFood = await this.foodRepository.save(food);

    let nutrition = await this.foodNutritionRepository.findOne({
      where: { tenantId, foodId: id },
    });
    nutrition = await this.foodNutritionRepository.save(
      this.foodNutritionRepository.create({
        id: nutrition?.id,
        tenantId,
        foodId: id,
        caloriesPer100g: toDecimalString(
          pickNumber(body.caloriesPer100g) ?? Number(nutrition?.caloriesPer100g ?? 0),
        ),
        proteinPer100g: toDecimalString(
          pickNumber(body.proteinPer100g) ?? Number(nutrition?.proteinPer100g ?? 0),
        ),
        fatPer100g: toDecimalString(
          pickNumber(body.fatPer100g) ?? Number(nutrition?.fatPer100g ?? 0),
        ),
        carbsPer100g: toDecimalString(
          pickNumber(body.carbsPer100g) ?? Number(nutrition?.carbsPer100g ?? 0),
        ),
        extraJson: {
          ...(nutrition?.extraJson ?? {}),
          ...(pickString(body.sourceRefId) === undefined
            ? {}
            : { sourceRefId: pickString(body.sourceRefId) ?? null }),
          ...(pickNumber(body.servingSize) === undefined
            ? {}
            : { servingSize: pickNumber(body.servingSize) }),
          ...(pickString(body.servingUnit) === undefined
            ? {}
            : { servingUnit: pickString(body.servingUnit) ?? 'g' }),
        },
      }),
    );
    return this.toFoodAdminItem(savedFood, nutrition);
  }

  private async updateFoodStatus(
    id: string,
    body: Record<string, unknown>,
    tenantId: string,
    _requestId: string,
  ): Promise<Record<string, unknown>> {
    const food = await this.foodRepository.findOne({ where: { tenantId, id } });
    if (!food) {
      throw new Error(`food not found: ${id}`);
    }
    food.status = pickString(body.status) ?? food.status;
    const savedFood = await this.foodRepository.save(food);
    const nutrition = await this.foodNutritionRepository.findOne({
      where: { tenantId, foodId: id },
    });
    return this.toFoodAdminItem(savedFood, nutrition);
  }

  private toFoodAdminItem(
    food: FoodEntity,
    nutrition: FoodNutritionEntity | null,
  ): Record<string, unknown> {
    const extra = nutrition?.extraJson ?? {};
    return {
      id: food.id,
      name: food.name,
      brand: food.brand ?? null,
      countryCode: food.countryCode ?? null,
      source: food.source ?? null,
      sourceRefId: pickString(extra.sourceRefId) ?? null,
      caloriesPer100g: Number(nutrition?.caloriesPer100g ?? 0),
      proteinPer100g: Number(nutrition?.proteinPer100g ?? 0),
      fatPer100g: Number(nutrition?.fatPer100g ?? 0),
      carbsPer100g: Number(nutrition?.carbsPer100g ?? 0),
      servingSize: pickNumber(extra.servingSize) ?? 100,
      servingUnit: pickString(extra.servingUnit) ?? 'g',
      status: food.status,
      createdAt: food.createdAt?.toISOString() ?? null,
      updatedAt: food.updatedAt?.toISOString() ?? null,
    };
  }
}

function dedupeByKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }
  return output;
}

function parseBodyPayload(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value.trim()) {
    return {};
  }
  return JSON.parse(value) as Record<string, unknown>;
}

function toDecimalString(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function pickNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
