import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In } from 'typeorm';
import type { Repository } from 'typeorm';
import { FoodEntity, FoodNutritionEntity } from '../../../common/entities/biz.entities';
import { FoodIdentityService } from '../../food/food-identity.service';
import { FoodKnowledgeService } from '../../food/food-knowledge.service';
import type {
  FoodNutritionProvider,
  ProviderSearchInput,
  ProviderStatus,
  StandardFoodCandidate,
} from '../food-query.types';

@Injectable()
export class InternalFoodProvider implements FoodNutritionProvider {
  readonly code = 'internal';

  constructor(
    @InjectRepository(FoodEntity)
    private readonly foodRepository: Repository<FoodEntity>,
    @InjectRepository(FoodNutritionEntity)
    private readonly foodNutritionRepository: Repository<FoodNutritionEntity>,
    @Inject(FoodIdentityService) private readonly foodIdentityService: FoodIdentityService,
    @Inject(FoodKnowledgeService) private readonly foodKnowledgeService: FoodKnowledgeService,
  ) {}

  isEnabled(): boolean {
    return true;
  }

  getStatus(): ProviderStatus {
    return { code: this.code, enabled: true };
  }

  async search(input: ProviderSearchInput): Promise<StandardFoodCandidate[]> {
    const tenantId = input.tenantId?.trim();
    if (!tenantId) {
      return [];
    }
    const queryNames = dedupeStrings(
      this.foodIdentityService.buildSearchTerms({
        name: input.query,
        locale: input.locale,
      }),
    );
    const collected = new Map<string, StandardFoodCandidate>();
    const knowledgeFoodIds = await this.foodKnowledgeService.findFoodIdsByNames({
      tenantId,
      queryNames,
    });

    for (const queryName of queryNames.slice(0, 4)) {
      const food =
        (await this.foodRepository.findOne({
          where: { tenantId, name: ILike(queryName.trim()) },
        }))
        ?? (await this.foodRepository.findOne({
          where: { tenantId, name: ILike(`%${queryName.trim()}%`) },
        }));
      if (!food) {
        continue;
      }
      const candidate = await this.toCandidate(food, tenantId, input);
      if (candidate) {
        collected.set(candidate.normalizedName, candidate);
      }
    }

    if (knowledgeFoodIds.length > 0) {
      const foods = await this.foodRepository.find({
        where: { id: In(knowledgeFoodIds.slice(0, 20)) },
      });
      for (const food of foods) {
        const normalized = this.foodIdentityService.normalizeName(food.name);
        if (collected.has(normalized)) {
          continue;
        }
        const candidate = await this.toCandidate(food, tenantId, input);
        if (candidate) {
          collected.set(candidate.normalizedName, candidate);
        }
      }
    }

    return [...collected.values()];
  }

  private async toCandidate(
    food: FoodEntity,
    tenantId: string,
    input: ProviderSearchInput,
  ): Promise<StandardFoodCandidate | null> {
    const nutrition = await this.foodNutritionRepository.findOne({
      where: { tenantId, foodId: food.id },
    });
    if (!nutrition) {
      return null;
    }
    const identity = this.foodIdentityService.buildIdentity({
      name: food.name,
      locale: input.locale,
      countryCode: input.countryCode ?? food.countryCode ?? undefined,
      sourceType: 'internal',
    });
    return {
      sourceCode: this.code,
      internalFoodId: food.id,
      type: 'ingredient',
      displayName: food.name,
      normalizedName: identity.normalizedName,
      nutrientsPer100g: {
        caloriesKcal: Number(nutrition.caloriesPer100g ?? 0),
        proteinGram: Number(nutrition.proteinPer100g ?? 0),
        fatGram: Number(nutrition.fatPer100g ?? 0),
        carbsGram: Number(nutrition.carbsPer100g ?? 0),
      },
      confidence: 0.9,
      verifiedLevel: 'internal_verified',
      rawPayload: { foodId: food.id },
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
