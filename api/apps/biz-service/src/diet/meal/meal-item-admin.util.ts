import type { MealItemEntity } from '../../common/entities/biz.entities';

export type MealItemAdminNutrition = {
  weight: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

export function resolveMealItemAdminNutrition(item: MealItemEntity): MealItemAdminNutrition {
  const direct = readNutritionNumbers({
    weight: item.weight,
    calories: item.calories,
    protein: item.protein,
    fat: item.fat,
    carbs: item.carbs,
  });
  if (hasMacroNutrition(direct)) {
    return direct;
  }

  const snapshotSources = [
    item.resultSnapshot,
    item.selectedCandidate,
    pickFirstCandidateWithNutrition(item.rawCandidates),
  ];
  for (const snapshot of snapshotSources) {
    const fromSnapshot = readNutritionFromSnapshot(snapshot, direct.weight);
    if (hasMacroNutrition(fromSnapshot)) {
      return fromSnapshot;
    }
  }

  return direct;
}

function readNutritionNumbers(input: {
  weight: string | number | null | undefined;
  calories: string | number | null | undefined;
  protein: string | number | null | undefined;
  fat: string | number | null | undefined;
  carbs: string | number | null | undefined;
}): MealItemAdminNutrition {
  return {
    weight: toNumber(input.weight),
    calories: toNumber(input.calories),
    protein: toNumber(input.protein),
    fat: toNumber(input.fat),
    carbs: toNumber(input.carbs),
  };
}

function readNutritionFromSnapshot(
  snapshot: unknown,
  fallbackWeight: number,
): MealItemAdminNutrition {
  const record = asRecord(snapshot);
  const serving = asRecord(record.nutrientsPerServing);
  const per100g = asRecord(record.nutrientsPer100g);
  const weight = toNumber(record.estimatedWeightGram) || fallbackWeight;

  if (Object.keys(serving).length > 0) {
    return {
      weight,
      calories: pickNutrientValue(serving, ['caloriesKcal', 'calories']),
      protein: pickNutrientValue(serving, ['proteinGram', 'protein']),
      fat: pickNutrientValue(serving, ['fatGram', 'fat']),
      carbs: pickNutrientValue(serving, ['carbsGram', 'carbs']),
    };
  }

  if (Object.keys(per100g).length > 0) {
    const ratio = Math.max(weight, 1) / 100;
    return {
      weight,
      calories: round(pickNutrientValue(per100g, ['caloriesKcal', 'calories']) * ratio),
      protein: round(pickNutrientValue(per100g, ['proteinGram', 'protein']) * ratio),
      fat: round(pickNutrientValue(per100g, ['fatGram', 'fat']) * ratio),
      carbs: round(pickNutrientValue(per100g, ['carbsGram', 'carbs']) * ratio),
    };
  }

  return {
    weight,
    calories: 0,
    protein: 0,
    fat: 0,
    carbs: 0,
  };
}

function pickFirstCandidateWithNutrition(rawCandidates: unknown): Record<string, unknown> | null {
  if (!Array.isArray(rawCandidates)) {
    return null;
  }
  for (const candidate of rawCandidates) {
    const record = asRecord(candidate);
    const per100g = asRecord(record.nutrientsPer100g);
    if (Object.keys(per100g).length > 0) {
      return record;
    }
  }
  return null;
}

function hasMacroNutrition(input: MealItemAdminNutrition): boolean {
  return input.calories > 0 || input.protein > 0 || input.fat > 0 || input.carbs > 0;
}

function pickNutrientValue(record: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = toNumber(record[key]);
    if (value > 0 || Object.prototype.hasOwnProperty.call(record, key)) {
      return value;
    }
  }
  return 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
