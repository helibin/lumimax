import type { NutritionLabelVisionResult } from '../../interfaces/provider.contracts';

export const NUTRITION_LABEL_VISION_PROMPT = [
  'Read this nutrition facts label and return JSON only.',
  'Use this shape:',
  '{"labelFound":true,"productName":"","brandName":"","servingSizeText":"","servingWeightGram":0,"servingsPerContainer":0,"calories":0,"protein":0,"fat":0,"carbs":0,"fiber":0,"sodiumMg":0,"confidence":0.0}.',
  'Rules:',
  '- Extract nutrition per serving, not per 100g.',
  '- servingWeightGram should be the serving size in grams when visible.',
  '- If the image is not a nutrition label or text is unreadable, set labelFound=false.',
  '- Use confidence from 0 to 1.',
].join(' ');

export function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function normalizeNutritionLabelVisionResult(
  parsed: Record<string, unknown>,
): NutritionLabelVisionResult {
  const nestedNutrients = isRecord(parsed.nutrients) ? parsed.nutrients : undefined;
  const nutrients = nestedNutrients ?? parsed;
  const servingSizeText = stringValue(parsed.servingSizeText) ?? stringValue(parsed.servingSize);
  const servingWeightGram =
    numberValue(parsed.servingWeightGram)
    ?? numberValue(parsed.servingSizeGram)
    ?? parseGramFromText(servingSizeText);
  const labelFound = booleanValue(parsed.labelFound);
  return {
    labelFound:
      labelFound
      ?? Boolean(
        servingWeightGram
        || numberValue(nutrients.calories)
        || numberValue(nutrients.protein)
        || numberValue(nutrients.fat)
        || numberValue(nutrients.carbs),
      ),
    productName: stringValue(parsed.productName) ?? stringValue(parsed.name),
    brandName: stringValue(parsed.brandName) ?? stringValue(parsed.brand),
    servingSizeText,
    servingWeightGram,
    servingsPerContainer: numberValue(parsed.servingsPerContainer),
    calories: numberValue(nutrients.calories) ?? numberValue(nutrients.caloriesKcal),
    protein: numberValue(nutrients.protein) ?? numberValue(nutrients.proteinGram),
    fat: numberValue(nutrients.fat) ?? numberValue(nutrients.fatGram),
    carbs: numberValue(nutrients.carbs) ?? numberValue(nutrients.carbsGram),
    fiber: numberValue(nutrients.fiber) ?? numberValue(nutrients.fiberGram),
    sodiumMg: numberValue(nutrients.sodiumMg) ?? numberValue(nutrients.sodium),
    confidence: numberValue(parsed.confidence),
    raw: parsed,
  };
}

function parseGramFromText(value?: string): number | undefined {
  const matched = value?.match(/(\d+(?:\.\d+)?)\s*g\b/i)?.[1];
  return matched ? numberValue(matched) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/,/g, '');
    if (!normalized) {
      return undefined;
    }
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
