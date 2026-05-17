import { Inject, Injectable } from '@nestjs/common';
import { getEnvString } from '@lumimax/config';
import { FoodIdentityService } from '../../food/food-identity.service';
import type { NutritionLabelVisionResult } from '../../interfaces/provider.contracts';
import { VisionProviderFactory } from '../../providers/vision/vision-provider.factory';
import type {
  FoodNutritionProvider,
  ProviderSearchInput,
  ProviderStatus,
  StandardFoodCandidate,
} from '../food-query.types';

@Injectable()
export class NutritionLabelOcrProvider implements FoodNutritionProvider {
  readonly code = 'nutrition_label_ocr';

  constructor(
    @Inject(FoodIdentityService) private readonly foodIdentityService: FoodIdentityService,
    @Inject(VisionProviderFactory)
    private readonly visionProviderFactory: VisionProviderFactory,
  ) {}

  isEnabled(): boolean {
    return getEnvString('FOOD_QUERY_ENABLE_NUTRITION_LABEL_OCR', 'true')!.trim().toLowerCase() === 'true';
  }

  getStatus(): ProviderStatus {
    return {
      code: this.code,
      enabled: this.isEnabled(),
      reason: this.isEnabled() ? undefined : 'FOOD_QUERY_ENABLE_NUTRITION_LABEL_OCR=false',
    };
  }

  async search(input: ProviderSearchInput): Promise<StandardFoodCandidate[]> {
    if (!this.isEnabled()) {
      return [];
    }
    const imageParsed = await this.parseFromImage(input);
    if (imageParsed) {
      return [this.toCandidate(imageParsed, input, 'vision_model')];
    }

    const textParsed = parseNutritionLabelText(input.ocrText ?? input.query);
    if (!textParsed) {
      return [];
    }
    return [this.toCandidate(textParsed, input, 'text_rule')];
  }

  private async parseFromImage(
    input: ProviderSearchInput,
  ): Promise<ParsedNutritionLabel | null> {
    if (!input.imageUrl?.trim()) {
      return null;
    }
    const active = this.visionProviderFactory.resolveActive().provider;
    if (!active.parseNutritionLabel) {
      return null;
    }
    const parsed = await active.parseNutritionLabel({
      imageUrl: input.imageUrl,
      locale: input.locale,
      countryCode: input.countryCode,
      requestId: input.requestId,
    });
    if (!parsed.labelFound || !hasCoreNutrition(parsed)) {
      return null;
    }
    return normalizeVisionParsedLabel(parsed);
  }

  private toCandidate(
    parsed: ParsedNutritionLabel,
    input: ProviderSearchInput,
    parser: 'vision_model' | 'text_rule',
  ): StandardFoodCandidate {
    const displayName = parsed.displayName || input.query || 'nutrition label';
    const identity = this.foodIdentityService.buildIdentity({
      name: displayName,
      locale: input.locale,
      countryCode: input.countryCode,
      sourceType: 'provider',
    });
    return {
      sourceCode: this.code,
      type: 'packaged_food',
      displayName,
      normalizedName: identity.normalizedName,
      brandName: parsed.brandName,
      servingUnit: parsed.servingUnit,
      servingWeightGram: parsed.servingWeightGram,
      nutrientsPer100g: parsed.per100g,
      nutrientsPerServing: parsed.perServing,
      confidence: parsed.confidence,
      verifiedLevel: 'provider_verified',
      rawPayload: {
        parser,
        imageType: input.imageType,
        sourceText: input.ocrText ?? input.query,
        ...(parsed.rawPayload ?? {}),
      },
    };
  }
}

type ParsedNutritionLabel = {
  displayName?: string;
  brandName?: string;
  servingUnit?: string;
  servingWeightGram?: number;
  perServing: {
    caloriesKcal: number;
    proteinGram: number;
    fatGram: number;
    carbsGram: number;
  };
  per100g: {
    caloriesKcal: number;
    proteinGram: number;
    fatGram: number;
    carbsGram: number;
  };
  confidence: number;
  rawPayload?: Record<string, unknown>;
};

function parseNutritionLabelText(value?: string): ParsedNutritionLabel | null {
  const text = value?.trim();
  if (!text) {
    return null;
  }
  const calories = matchNumber(text, [/calories?\s*[:=]?\s*(\d+(?:\.\d+)?)/i, /energy\s*[:=]?\s*(\d+(?:\.\d+)?)\s*k?cal/i]);
  const protein = matchNumber(text, [/protein\s*[:=]?\s*(\d+(?:\.\d+)?)/i]);
  const fat = matchNumber(text, [/total\s+fat\s*[:=]?\s*(\d+(?:\.\d+)?)/i, /fat\s*[:=]?\s*(\d+(?:\.\d+)?)/i]);
  const carbs = matchNumber(text, [/total\s+carbohydrate[s]?\s*[:=]?\s*(\d+(?:\.\d+)?)/i, /carb(?:ohydrate)?s?\s*[:=]?\s*(\d+(?:\.\d+)?)/i]);
  if ([calories, protein, fat, carbs].every((item) => item === undefined)) {
    return null;
  }
  const servingWeightGram = matchNumber(text, [/serving\s+size\s*[:=]?\s*(\d+(?:\.\d+)?)\s*g/i]);
  const perServing = {
    caloriesKcal: round(calories ?? 0),
    proteinGram: round(protein ?? 0),
    fatGram: round(fat ?? 0),
    carbsGram: round(carbs ?? 0),
  };
  const ratio = servingWeightGram && servingWeightGram > 0 ? 100 / servingWeightGram : 1;
  return {
    displayName: matchString(text, [/product\s*[:=]?\s*([^\n,;]+)/i, /item\s*[:=]?\s*([^\n,;]+)/i]),
    brandName: matchString(text, [/brand\s*[:=]?\s*([^\n,;]+)/i]),
    servingUnit: matchString(text, [/serving\s+size\s*[:=]?\s*([^\n]+)/i]),
    servingWeightGram,
    perServing,
    per100g: {
      caloriesKcal: round(perServing.caloriesKcal * ratio),
      proteinGram: round(perServing.proteinGram * ratio),
      fatGram: round(perServing.fatGram * ratio),
      carbsGram: round(perServing.carbsGram * ratio),
    },
    confidence: 0.93,
    rawPayload: {
      sourceText: text,
    },
  };
}

function normalizeVisionParsedLabel(parsed: NutritionLabelVisionResult): ParsedNutritionLabel {
  const perServing = {
    caloriesKcal: round(parsed.calories ?? 0),
    proteinGram: round(parsed.protein ?? 0),
    fatGram: round(parsed.fat ?? 0),
    carbsGram: round(parsed.carbs ?? 0),
  };
  const ratio = parsed.servingWeightGram && parsed.servingWeightGram > 0
    ? 100 / parsed.servingWeightGram
    : 1;
  return {
    displayName: parsed.productName,
    brandName: parsed.brandName,
    servingUnit: parsed.servingSizeText,
    servingWeightGram: parsed.servingWeightGram,
    perServing,
    per100g: {
      caloriesKcal: round(perServing.caloriesKcal * ratio),
      proteinGram: round(perServing.proteinGram * ratio),
      fatGram: round(perServing.fatGram * ratio),
      carbsGram: round(perServing.carbsGram * ratio),
    },
    confidence: parsed.confidence && parsed.confidence > 0 ? parsed.confidence : 0.96,
    rawPayload: {
      servingsPerContainer: parsed.servingsPerContainer,
      fiber: parsed.fiber,
      sodiumMg: parsed.sodiumMg,
      raw: parsed.raw,
    },
  };
}

function hasCoreNutrition(parsed: NutritionLabelVisionResult): boolean {
  return [parsed.calories, parsed.protein, parsed.fat, parsed.carbs]
    .some((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function matchNumber(value: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const matched = value.match(pattern)?.[1];
    if (!matched) {
      continue;
    }
    const parsed = Number(matched);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function matchString(value: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const matched = value.match(pattern)?.[1]?.trim();
    if (matched) {
      return matched;
    }
  }
  return undefined;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
