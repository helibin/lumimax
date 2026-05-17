import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { ILike, In } from 'typeorm';
import { MealItemEntity } from '../../common/entities/biz.entities';
import { FoodIdentityService } from './food-identity.service';

export interface UserCommonFoodEntry {
  foodName: string;
  canonicalName: string;
  normalizedName: string;
  aliases: string[];
  usageCount: number;
  defaultWeightGram: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  fatPer100g: number;
  carbsPer100g: number;
  lastUsedAt?: string;
  confidence: number;
}

export interface AdminUserCommonFoodItem {
  userId: string;
  foodName: string;
  canonicalName: string;
  normalizedName: string;
  foodId: string | null;
  usageCount: number;
  defaultWeightGram: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  fatPer100g: number;
  carbsPer100g: number;
  lastUsedAt: string | null;
  source: 'user_common';
}

@Injectable()
export class UserFoodProfileService {
  constructor(
    @InjectRepository(MealItemEntity)
    private readonly mealItemRepository: Repository<MealItemEntity>,
    @Inject(FoodIdentityService) private readonly foodIdentityService: FoodIdentityService,
  ) {}

  async findCommonFoods(input: {
    userId?: string;
    tenantId?: string;
    queryNames: string[];
    limit?: number;
  }): Promise<UserCommonFoodEntry[]> {
    if (!input.userId?.trim()) {
      return [];
    }

    const rows = await this.mealItemRepository.find({
      where: {
        tenantId: input.tenantId,
        userId: input.userId.trim(),
        recognitionStatus: In(['confirmed', 'corrected']),
      },
      order: { createdAt: 'DESC' },
      take: 120,
    });

    const groups = new Map<string, UserCommonFoodEntry>();
    for (const row of rows) {
      const identity = this.foodIdentityService.buildIdentity({
        name: row.foodName,
        sourceType: 'user_common',
      });
      const key = identity.normalizedName;
      const existing = groups.get(key);
      const weightGram = Number(row.weight ?? 0);
      if (!existing) {
        groups.set(key, {
          foodName: row.foodName,
          canonicalName: identity.canonicalName,
          normalizedName: identity.normalizedName,
          aliases: identity.aliases,
          usageCount: 1,
          defaultWeightGram: weightGram,
          caloriesPer100g: toPer100g(Number(row.calories ?? 0), weightGram),
          proteinPer100g: toPer100g(Number(row.protein ?? 0), weightGram),
          fatPer100g: toPer100g(Number(row.fat ?? 0), weightGram),
          carbsPer100g: toPer100g(Number(row.carbs ?? 0), weightGram),
          lastUsedAt: row.createdAt?.toISOString(),
          confidence: 0,
        });
        continue;
      }
      existing.usageCount += 1;
      existing.defaultWeightGram = round(
        (existing.defaultWeightGram * (existing.usageCount - 1) + weightGram) / existing.usageCount,
      );
      existing.caloriesPer100g = round(
        (existing.caloriesPer100g * (existing.usageCount - 1) + toPer100g(Number(row.calories ?? 0), weightGram))
          / existing.usageCount,
      );
      existing.proteinPer100g = round(
        (existing.proteinPer100g * (existing.usageCount - 1) + toPer100g(Number(row.protein ?? 0), weightGram))
          / existing.usageCount,
      );
      existing.fatPer100g = round(
        (existing.fatPer100g * (existing.usageCount - 1) + toPer100g(Number(row.fat ?? 0), weightGram))
          / existing.usageCount,
      );
      existing.carbsPer100g = round(
        (existing.carbsPer100g * (existing.usageCount - 1) + toPer100g(Number(row.carbs ?? 0), weightGram))
          / existing.usageCount,
      );
    }

    const queryNames = input.queryNames.filter(Boolean);
    const ranked = [...groups.values()]
      .map((entry) => ({
        ...entry,
        confidence: round(
          this.foodIdentityService.scoreNameMatch({
            queryNames,
            targetName: entry.foodName,
            aliases: entry.aliases,
          }) * 0.65 + Math.min(entry.usageCount, 8) / 8 * 0.35,
        ),
      }))
      .filter((entry) => entry.confidence > 0 || queryNames.length === 0)
      .sort((left, right) => right.confidence - left.confidence || right.usageCount - left.usageCount);

    return ranked.slice(0, Math.max(1, input.limit ?? 5));
  }

  async listAdminUserCommonFoods(input: {
    tenantId: string;
    page: number;
    pageSize: number;
    keyword?: string;
    userId?: string;
  }): Promise<{ items: AdminUserCommonFoodItem[]; total: number }> {
    const keyword = input.keyword?.trim();
    const userId = input.userId?.trim();
    const baseWhere: FindOptionsWhere<MealItemEntity> = {
      tenantId: input.tenantId,
      recognitionStatus: In(['confirmed', 'corrected']),
    };
    if (userId) {
      baseWhere.userId = userId;
    }

    const where = keyword
      ? [
          { ...baseWhere, foodName: ILike(`%${keyword}%`) },
          { ...baseWhere, userId: ILike(`%${keyword}%`) },
        ]
      : baseWhere;

    const rows = await this.mealItemRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: 5000,
    });

    const groups = new Map<string, AdminUserCommonFoodItem>();
    for (const row of rows) {
      const rowUserId = row.userId?.trim();
      if (!rowUserId) {
        continue;
      }
      const identity = this.foodIdentityService.buildIdentity({
        name: row.foodName,
        sourceType: 'user_common',
      });
      const key = `${rowUserId}::${identity.normalizedName}`;
      const weightGram = Number(row.weight ?? 0);
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          userId: rowUserId,
          foodName: row.foodName,
          canonicalName: identity.canonicalName,
          normalizedName: identity.normalizedName,
          foodId: row.foodId?.trim() || null,
          usageCount: 1,
          defaultWeightGram: weightGram,
          caloriesPer100g: toPer100g(Number(row.calories ?? 0), weightGram),
          proteinPer100g: toPer100g(Number(row.protein ?? 0), weightGram),
          fatPer100g: toPer100g(Number(row.fat ?? 0), weightGram),
          carbsPer100g: toPer100g(Number(row.carbs ?? 0), weightGram),
          lastUsedAt: row.createdAt?.toISOString() ?? null,
          source: 'user_common',
        });
        continue;
      }
      existing.usageCount += 1;
      existing.defaultWeightGram = round(
        (existing.defaultWeightGram * (existing.usageCount - 1) + weightGram) / existing.usageCount,
      );
      existing.caloriesPer100g = round(
        (existing.caloriesPer100g * (existing.usageCount - 1) + toPer100g(Number(row.calories ?? 0), weightGram))
          / existing.usageCount,
      );
      existing.proteinPer100g = round(
        (existing.proteinPer100g * (existing.usageCount - 1) + toPer100g(Number(row.protein ?? 0), weightGram))
          / existing.usageCount,
      );
      existing.fatPer100g = round(
        (existing.fatPer100g * (existing.usageCount - 1) + toPer100g(Number(row.fat ?? 0), weightGram))
          / existing.usageCount,
      );
      existing.carbsPer100g = round(
        (existing.carbsPer100g * (existing.usageCount - 1) + toPer100g(Number(row.carbs ?? 0), weightGram))
          / existing.usageCount,
      );
      const createdAt = row.createdAt?.toISOString() ?? null;
      if (createdAt && (!existing.lastUsedAt || createdAt > existing.lastUsedAt)) {
        existing.lastUsedAt = createdAt;
        if (row.foodId?.trim()) {
          existing.foodId = row.foodId.trim();
        }
      }
    }

    const sorted = [...groups.values()].sort(
      (left, right) =>
        Date.parse(right.lastUsedAt ?? '') - Date.parse(left.lastUsedAt ?? '')
        || right.usageCount - left.usageCount,
    );
    const page = Math.max(1, input.page);
    const pageSize = Math.max(1, input.pageSize);
    const offset = (page - 1) * pageSize;
    return {
      items: sorted.slice(offset, offset + pageSize),
      total: sorted.length,
    };
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function toPer100g(value: number, weightGram: number): number {
  const safeWeight = Math.max(weightGram, 1);
  return round(value / safeWeight * 100);
}
