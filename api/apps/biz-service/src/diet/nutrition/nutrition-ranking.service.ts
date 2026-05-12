import { Inject, Injectable } from '@nestjs/common';
import type { NutritionCandidate } from '../interfaces/diet-center.contracts';
import { FoodIdentityService } from '../food/food-identity.service';

@Injectable()
export class NutritionRankingService {
  constructor(
    @Inject(FoodIdentityService) private readonly foodIdentityService: FoodIdentityService,
  ) {}

  rankCandidates(
    candidates: NutritionCandidate[],
    input: {
      queryNames: string[];
      imageConfidence?: number;
    },
  ): NutritionCandidate[] {
    return candidates
      .map((candidate) => ({
        ...candidate,
        score: round(this.scoreCandidate(candidate, input)),
        reasonCodes: this.buildReasonCodes(candidate),
      }))
      .sort((left, right) => (right.score ?? 0) - (left.score ?? 0));
  }

  private scoreCandidate(
    candidate: NutritionCandidate,
    input: {
      queryNames: string[];
      imageConfidence?: number;
    },
  ): number {
    const nameMatchScore = this.foodIdentityService.scoreNameMatch({
      queryNames: input.queryNames,
      targetName: candidate.foodName,
      aliases: [candidate.canonicalName],
    });
    const providerTrustScore = providerTrust[candidate.provider] ?? 0.55;
    const sourceScore = matchedByWeight[candidate.matchedBy] ?? 0.45;
    const imageConfidenceScore = Math.max(0, Math.min(input.imageConfidence ?? 0.5, 1));
    const completenessScore = hasCoreNutrition(candidate) ? 1 : 0.35;

    return nameMatchScore * 0.3
      + providerTrustScore * 0.2
      + sourceScore * 0.2
      + imageConfidenceScore * 0.15
      + completenessScore * 0.15;
  }

  private buildReasonCodes(candidate: NutritionCandidate): string[] {
    const reasons = [candidate.matchedBy, candidate.provider];
    if (candidate.verifiedLevel === 'confirmed') {
      reasons.push('user-confirmed');
    }
    if (candidate.verifiedLevel === 'estimated') {
      reasons.push('estimated');
    }
    return reasons;
  }
}

const providerTrust: Record<string, number> = {
  user_common: 0.98,
  'local-db': 0.9,
  nutritionix: 0.8,
  usda_fdc: 0.82,
  open_food_facts: 0.74,
  edamam: 0.76,
  llm_estimator: 0.45,
  'fallback-catalog': 0.3,
};

const matchedByWeight: Record<NutritionCandidate['matchedBy'], number> = {
  user_common: 1,
  internal: 0.88,
  provider: 0.72,
  barcode: 0.84,
  recipe: 0.7,
  llm_estimated: 0.42,
};

function hasCoreNutrition(candidate: NutritionCandidate): boolean {
  return candidate.caloriesPer100g > 0
    || candidate.proteinPer100g > 0
    || candidate.fatPer100g > 0
    || candidate.carbsPer100g > 0;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
