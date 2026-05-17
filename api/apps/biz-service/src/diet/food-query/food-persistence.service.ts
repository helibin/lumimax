import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike } from 'typeorm';
import type { Repository } from 'typeorm';
import { FoodEntity, FoodNutritionEntity } from '../../common/entities/biz.entities';
import { FoodIdentityService } from '../food/food-identity.service';
import { FoodKnowledgeService } from '../food/food-knowledge.service';
import type { StandardFoodCandidate } from './food-query.types';

@Injectable()
export class FoodPersistenceService {
  constructor(
    @InjectRepository(FoodEntity)
    private readonly foodRepository: Repository<FoodEntity>,
    @InjectRepository(FoodNutritionEntity)
    private readonly foodNutritionRepository: Repository<FoodNutritionEntity>,
    @Inject(FoodIdentityService) private readonly foodIdentityService: FoodIdentityService,
    @Inject(FoodKnowledgeService) private readonly foodKnowledgeService: FoodKnowledgeService,
  ) {}

  async persistConfirmedFood(input: {
    tenantId: string;
    userId?: string;
    locale?: string;
    countryCode?: string;
    candidate: StandardFoodCandidate;
    requestId: string;
  }): Promise<{ foodId: string }> {
    const selected = input.candidate;
    const per100g = selected.nutrientsPer100g;
    if (!per100g) {
      throw new Error('confirmed food candidate missing per100g nutrients');
    }

    const existing = await this.foodRepository.findOne({
      where: { tenantId: input.tenantId, name: ILike(selected.displayName) },
    });
    const food = await this.foodRepository.save(
      this.foodRepository.create({
        id: existing?.id ?? selected.internalFoodId,
        tenantId: input.tenantId,
        name: selected.displayName,
        brand: selected.brandName ?? existing?.brand ?? null,
        countryCode: input.countryCode ?? existing?.countryCode ?? null,
        source: selected.sourceCode,
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
        caloriesPer100g: toDecimalString(per100g.caloriesKcal),
        proteinPer100g: toDecimalString(per100g.proteinGram),
        fatPer100g: toDecimalString(per100g.fatGram),
        carbsPer100g: toDecimalString(per100g.carbsGram),
        extraJson: {
          ...(nutrition?.extraJson ?? {}),
          normalizedName: selected.normalizedName,
          verifiedLevel: selected.verifiedLevel,
          provider: selected.sourceCode,
          locale: input.locale ?? null,
          sourceCountryCode: input.countryCode ?? null,
          sourceTrace: buildSourceTrace(selected),
        },
      }),
    );

    const identity = this.foodIdentityService.buildIdentity({
      name: selected.displayName,
      locale: input.locale,
      countryCode: input.countryCode,
      sourceType: 'internal',
    });
    await this.foodKnowledgeService.syncFoodIdentity({
      food,
      tenantId: input.tenantId,
      locale: input.locale,
      countryCode: input.countryCode,
      aliases: dedupeStrings([selected.displayName, identity.canonicalName]),
      requestId: input.requestId,
    });
    await this.foodKnowledgeService.syncExternalMapping({
      foodId: food.id,
      tenantId: input.tenantId,
      providerCode: selected.sourceCode,
      externalFoodId: selected.externalFoodId,
      externalName: selected.displayName,
      locale: input.locale,
      countryCode: input.countryCode,
      confidence: selected.confidence,
      rawPayload: isRecord(selected.rawPayload) ? selected.rawPayload : undefined,
      requestId: input.requestId,
    });

    return { foodId: food.id };
  }
}

function buildSourceTrace(selected: StandardFoodCandidate): Record<string, unknown> {
  const rawPayload = isRecord(selected.rawPayload) ? selected.rawPayload : null;
  const rawPayloadJson = rawPayload ? JSON.stringify(rawPayload) : null;
  return {
    provider: selected.sourceCode,
    verifiedLevel: selected.verifiedLevel,
    externalFoodId: selected.externalFoodId ?? null,
    rawPayload,
    rawPayloadHash: rawPayloadJson ? sha256(rawPayloadJson) : null,
    cachedAt: new Date().toISOString(),
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) {
      return false;
    }
    seen.add(trimmed.toLowerCase());
    return true;
  });
}

function toDecimalString(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
