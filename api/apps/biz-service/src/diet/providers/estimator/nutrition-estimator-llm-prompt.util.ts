import type { EstimateNutritionInput } from '../../interfaces/provider.contracts';

export const NUTRITION_ESTIMATOR_SYSTEM_PROMPT = [
  'Estimate nutrition for the food item.',
  'Return JSON only as {"name":"","calories":0,"protein":0,"fat":0,"carbs":0,"fiber":0,"confidence":0.0}.',
  'Return nutrients for the provided serving weight, not per 100g.',
  'name should be a normalized food name in English unless the input is clearly brand-specific.',
  'Use confidence from 0 to 1.',
  'Do not wrap JSON in markdown. Do not add explanations.',
].join(' ');

export function buildNutritionEstimatorUserPrompt(input: EstimateNutritionInput): string {
  return [
    `food=${input.foodName};`,
    `weightGram=${input.weightGram ?? 100};`,
    `locale=${input.locale ?? 'unknown'};`,
    `country=${input.countryCode ?? 'unknown'}`,
  ].join(' ');
}

export function parseLlmJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function readLlmString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function readLlmNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
