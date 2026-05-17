import assert from 'node:assert/strict';
import test from 'node:test';
import type { MealItemEntity } from '../../common/entities/biz.entities';
import { resolveMealItemAdminNutrition } from './meal-item-admin.util';

test('resolveMealItemAdminNutrition prefers persisted values when macros exist', () => {
  const item = {
    weight: '120',
    calories: '210',
    protein: '12',
    fat: '4',
    carbs: '28',
    resultSnapshot: null,
  } as unknown as MealItemEntity;

  assert.deepEqual(resolveMealItemAdminNutrition(item), {
    weight: 120,
    calories: 210,
    protein: 12,
    fat: 4,
    carbs: 28,
  });
});

test('resolveMealItemAdminNutrition falls back to resultSnapshot serving', () => {
  const item = {
    weight: '123.5',
    calories: '0',
    protein: '0',
    fat: '0',
    carbs: '0',
    resultSnapshot: {
      nutrientsPerServing: {
        caloriesKcal: 250,
        proteinGram: 8,
        fatGram: 12,
        carbsGram: 30,
      },
    },
  } as unknown as MealItemEntity;

  assert.deepEqual(resolveMealItemAdminNutrition(item), {
    weight: 123.5,
    calories: 250,
    protein: 8,
    fat: 12,
    carbs: 30,
  });
});
