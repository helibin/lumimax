import assert from 'node:assert/strict';
import test from 'node:test';
import type { MealItemEntity } from '../../common/entities/biz.entities';
import { applyConfirmedSnapshot, applyFoodQuerySnapshots } from './food-query-snapshot.util';
import type { FoodQueryResult } from './food-query.types';

function buildItem(): MealItemEntity {
  return {
    id: '01hitem00000000000000001',
    tenantId: '01htenant0000000000001',
    mealRecordId: '01hmeal000000000000000001',
    foodName: 'apple',
    weight: '100.00',
    calories: '52.00',
    protein: '0.30',
    fat: '0.20',
    carbs: '14.00',
    recognitionStatus: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
    isDisabled: false,
  } as MealItemEntity;
}

test('applyFoodQuerySnapshots stores query and candidate payloads', () => {
  const item = buildItem();
  const result: FoodQueryResult = {
    requestId: 'req_1',
    market: 'us',
    inputType: 'manual_text',
    queryItems: [{ type: 'ingredient', name: 'apple', confidence: 0.9 }],
    candidates: [
      {
        sourceCode: 'usda',
        type: 'ingredient',
        displayName: 'Apple',
        normalizedName: 'apple',
        confidence: 0.8,
        verifiedLevel: 'provider_verified',
      },
    ],
    selected: {
      sourceCode: 'usda',
      type: 'ingredient',
      displayName: 'Apple',
      normalizedName: 'apple',
      confidence: 0.8,
      verifiedLevel: 'provider_verified',
    },
    routing: { routeKey: 'default', providerCodes: ['internal', 'usda'], queryNames: ['apple'] },
    recognition: { provider: 'vision', status: 'success', confidence: 0.9 },
    debug: {
      providerTraces: [
        {
          provider: 'usda',
          stage: 'search',
          status: 'success',
          durationMs: 12,
          candidateCount: 1,
          stop: true,
          output: {
            candidates: [
              {
                sourceCode: 'usda',
                displayName: 'Apple',
              },
            ],
          },
        },
      ],
    },
  };

  applyFoodQuerySnapshots(item, result);

  assert.equal(item.querySnapshot?.requestId, 'req_1');
  assert.equal(item.recognitionSnapshot?.provider, 'vision');
  assert.equal(item.resultSnapshot?.displayName, 'Apple');
  assert.equal(item.rawCandidates?.length, 1);
  assert.equal(item.selectedCandidate?.sourceCode, 'usda');
  assert.equal(
    (
      item.querySnapshot?.debug as { providerTraces?: Array<{ provider?: string }> } | undefined
    )?.providerTraces?.[0]?.provider,
    'usda',
  );
});

test('applyConfirmedSnapshot links food id after confirm', () => {
  const item = buildItem();
  const result: FoodQueryResult = {
    requestId: 'req_2',
    market: 'cn',
    inputType: 'manual_text',
    queryItems: [],
    candidates: [],
    routing: { routeKey: 'default', providerCodes: [], queryNames: [] },
  };
  const selected = {
    sourceCode: 'internal',
    type: 'ingredient' as const,
    displayName: '米饭',
    normalizedName: '米饭',
    confidence: 1,
    verifiedLevel: 'internal_verified' as const,
  };

  applyConfirmedSnapshot(item, {
    foodId: '01hfood000000000000000001',
    result,
    selected,
  });

  assert.equal(item.foodId, '01hfood000000000000000001');
  assert.equal(item.recognitionStatus, 'pending');
  assert.equal(item.resultSnapshot?.displayName, '米饭');
});
