import type { MealItemEntity } from '../../common/entities/biz.entities';
import type { FoodQueryResult, StandardFoodCandidate } from './food-query.types';

export function applyFoodQuerySnapshots(
  item: MealItemEntity,
  result: FoodQueryResult,
): void {
  item.querySnapshot = sanitizeJson(result) as Record<string, unknown>;
  item.recognitionSnapshot = result.recognition
    ? (sanitizeJson(result.recognition) as Record<string, unknown>)
    : null;
  item.resultSnapshot = result.selected
    ? (sanitizeJson(result.selected) as Record<string, unknown>)
    : null;
  item.rawCandidates = result.candidates.map(
    (candidate) => sanitizeJson(candidate) as Record<string, unknown>,
  );
  item.selectedCandidate = result.selected
    ? (sanitizeJson(result.selected) as Record<string, unknown>)
    : null;
}

export function applyConfirmedSnapshot(
  item: MealItemEntity,
  input: {
    foodId: string;
    result: FoodQueryResult;
    selected: StandardFoodCandidate;
  },
): void {
  applyFoodQuerySnapshots(item, input.result);
  item.foodId = input.foodId;
  item.resultSnapshot = sanitizeJson(input.selected) as Record<string, unknown>;
  item.selectedCandidate = item.resultSnapshot;
}

function sanitizeJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null));
}
