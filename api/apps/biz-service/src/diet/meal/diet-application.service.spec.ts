import assert from 'node:assert/strict';
import test from 'node:test';
import type { FoodQueryResult } from '../food-query/food-query.types';
import { DietApplicationService } from './diet-application.service';

function repository<T extends Record<string, any>>(seed: T[] = []) {
  const items = [...seed];
  return {
    items,
    create(input: T) {
      return { ...input } as T;
    },
    async save(input: T) {
      const now = new Date();
      const entity = {
        createdAt: input.createdAt ?? now,
        updatedAt: now,
        isDisabled: input.isDisabled ?? false,
        id: input.id ?? `id_${items.length + 1}`,
        ...input,
      } as T;
      const index = items.findIndex((item) => item.id === entity.id);
      if (index >= 0) {
        items[index] = entity;
      } else {
        items.push(entity);
      }
      return entity;
    },
    async findOne(input: { where: Record<string, unknown> }) {
      return items.find((item) => matchesWhere(item, input.where)) ?? null;
    },
    async find(input?: { where?: Record<string, unknown> }) {
      if (!input?.where) {
        return items;
      }
      return items.filter((item) => matchesWhere(item, input.where!));
    },
    async count(input?: { where?: Record<string, unknown> }) {
      if (!input?.where) {
        return items.length;
      }
      return items.filter((item) => matchesWhere(item, input.where!)).length;
    },
  };
}

test('analyze food item writes food-query debug snapshot into recognition log', async () => {
  const meals = repository<any>([
    {
      id: 'meal_1',
      tenantId: 'tenant_1',
      userId: 'user_1',
      deviceId: 'device_1',
      status: 'created',
      totalCalories: '0.00',
      totalWeight: '0.00',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  const devices = repository<any>();
  const items = repository<any>();
  const logs = repository<any>();

  const foodQueryResult: FoodQueryResult = {
    requestId: 'req_log',
    market: 'us',
    inputType: 'image',
    queryItems: [
      {
        type: 'packaged_food',
        name: 'Protein Bar',
        displayName: 'Protein Bar',
        confidence: 0.96,
      },
    ],
    candidates: [
      {
        sourceCode: 'nutrition_label_ocr',
        type: 'packaged_food',
        displayName: 'Protein Bar',
        normalizedName: 'protein bar',
        servingWeightGram: 50,
        nutrientsPer100g: {
          caloriesKcal: 420,
          proteinGram: 40,
          fatGram: 14,
          carbsGram: 36,
        },
        nutrientsPerServing: {
          caloriesKcal: 210,
          proteinGram: 20,
          fatGram: 7,
          carbsGram: 18,
        },
        confidence: 0.97,
        verifiedLevel: 'provider_verified',
        rawPayload: {
          parser: 'vision_model',
          raw: {
            labelFound: true,
            calories: 210,
            protein: 20,
          },
        },
      },
    ],
    selected: {
      sourceCode: 'nutrition_label_ocr',
      type: 'packaged_food',
      displayName: 'Protein Bar',
      normalizedName: 'protein bar',
      servingWeightGram: 50,
      nutrientsPer100g: {
        caloriesKcal: 420,
        proteinGram: 40,
        fatGram: 14,
        carbsGram: 36,
      },
      nutrientsPerServing: {
        caloriesKcal: 210,
        proteinGram: 20,
        fatGram: 7,
        carbsGram: 18,
      },
      confidence: 0.97,
      verifiedLevel: 'provider_verified',
      rawPayload: {
        parser: 'vision_model',
        raw: {
          labelFound: true,
        },
      },
    },
    routing: {
      routeKey: 'packaged_food',
      providerCodes: ['nutrition_label_ocr'],
      queryNames: ['Protein Bar'],
    },
    recognition: {
      provider: 'vision',
      status: 'success',
      confidence: 0.96,
      imageType: 'nutrition_label',
    },
    debug: {
      providerTraces: [
        {
          provider: 'nutrition_label_ocr',
          stage: 'search',
          status: 'success',
          durationMs: 11,
          candidateCount: 1,
          stop: true,
          output: {
            candidates: [
              {
                sourceCode: 'nutrition_label_ocr',
                rawPayload: {
                  parser: 'vision_model',
                  raw: {
                    labelFound: true,
                    calories: 210,
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };

  const service = new DietApplicationService(
    meals as never,
    devices as never,
    items as never,
    logs as never,
    {} as never,
    {
      async query() {
        return foodQueryResult;
      },
    } as never,
    {} as never,
    {
      isEnabled() {
        return false;
      },
    } as never,
    {} as never,
  );

  await service.analyzeFoodItem({
    mealRecordId: 'meal_1',
    userId: 'user_1',
    deviceId: 'device_1',
    type: 'image',
    target: 'tmp-file/device/device_1/label.png',
    imageKey: 'tmp-file/device/device_1/label.png',
    imageUrl: 'https://example.com/label.png',
    imageObjectId: 'obj_1',
    weightGram: 50,
    requestId: 'req_log',
  });

  assert.equal(logs.items.length, 1);
  assert.equal(logs.items[0]?.provider, 'vision');
  assert.equal(
    logs.items[0]?.responsePayloadJson?.debugSnapshot?.providerTraces?.[0]?.provider,
    'nutrition_label_ocr',
  );
  assert.equal(
    logs.items[0]?.responsePayloadJson?.debugSnapshot?.providerTraces?.[0]?.output?.candidates?.[0]?.rawPayload?.parser,
    'vision_model',
  );
  assert.equal(
    logs.items[0]?.responsePayloadJson?.querySnapshot?.debug?.providerTraces?.[0]?.provider,
    'nutrition_label_ocr',
  );
});

test('packaged food image with unverified zero nutrition still requires user confirmation', async () => {
  const meals = repository<any>([
    {
      id: 'meal_1',
      tenantId: 'tenant_1',
      userId: 'user_1',
      deviceId: 'device_1',
      status: 'created',
      totalCalories: '0.00',
      totalWeight: '0.00',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  const devices = repository<any>();
  const items = repository<any>();
  const logs = repository<any>();

  const service = new DietApplicationService(
    meals as never,
    devices as never,
    items as never,
    logs as never,
    {} as never,
    {
      async query() {
        return {
          requestId: 'req_packaged_confirm',
          market: 'us',
          inputType: 'image',
          queryItems: [
            {
              type: 'packaged_food',
              name: 'Kirkland Signature Almond Milk Chocolate',
              displayName: '杏仁牛奶巧克力',
              confidence: 0.97,
            },
          ],
          candidates: [
            {
              sourceCode: 'vision',
              type: 'packaged_food',
              displayName: '杏仁牛奶巧克力',
              normalizedName: '杏仁牛奶巧克力',
              nutrientsPer100g: {
                caloriesKcal: 0,
                proteinGram: 0,
                fatGram: 0,
                carbsGram: 0,
              },
              confidence: 0.97,
              verifiedLevel: 'unverified',
            },
          ],
          selected: {
            sourceCode: 'vision',
            type: 'packaged_food',
            displayName: '杏仁牛奶巧克力',
            normalizedName: '杏仁牛奶巧克力',
            nutrientsPer100g: {
              caloriesKcal: 0,
              proteinGram: 0,
              fatGram: 0,
              carbsGram: 0,
            },
            confidence: 0.97,
            verifiedLevel: 'unverified',
          },
          routing: {
            routeKey: 'packaged_food',
            providerCodes: ['vision', 'nutrition_label_ocr'],
            queryNames: ['杏仁牛奶巧克力'],
          },
          recognition: {
            provider: 'vision',
            status: 'success',
            confidence: 0.97,
            imageType: 'packaged_food_front',
          },
        } satisfies FoodQueryResult;
      },
    } as never,
    {} as never,
    {
      isEnabled() {
        return false;
      },
    } as never,
    {} as never,
  );

  const result = await service.analyzeFoodItem({
    mealRecordId: 'meal_1',
    userId: 'user_1',
    deviceId: 'device_1',
    type: 'image',
    target: 'tmp-file/device/device_1/label.png',
    imageKey: 'tmp-file/device/device_1/label.png',
    imageUrl: 'https://example.com/label.png',
    imageObjectId: 'obj_1',
    weightGram: 50,
    requestId: 'req_packaged_confirm',
  });

  assert.equal(result.requiresUserConfirmation, true);
});

test('confirm food item reuses prior query aliases for provider fallback search', async () => {
  const meals = repository<any>([
    {
      id: 'meal_1',
      tenantId: 'tenant_1',
      userId: 'user_1',
      deviceId: 'device_1',
      status: 'created',
      market: 'US',
      locale: 'zh-CN',
      totalCalories: '0.00',
      totalWeight: '0.00',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  const devices = repository<any>();
  const items = repository<any>([
    {
      id: 'item_1',
      mealRecordId: 'meal_1',
      tenantId: 'tenant_1',
      foodName: '鸡肉粥',
      weight: '180.00',
      recognitionStatus: 'pending',
      locale: 'zh-CN',
      market: 'US',
      querySnapshot: {
        routing: {
          queryNames: ['鸡肉粥', 'Chicken Congee'],
        },
      },
      selectedCandidate: {
        displayName: 'Chicken Congee',
        canonicalName: 'Chicken Congee',
        normalizedName: 'chicken congee',
      },
      rawCandidates: [
        {
          displayName: 'Chicken Rice Porridge',
          canonicalName: 'Chicken Rice Porridge',
        },
      ],
    },
  ]);
  const logs = repository<any>();
  let receivedCandidateNames: string[] | undefined;

  const service = new DietApplicationService(
    meals as never,
    devices as never,
    items as never,
    logs as never,
    {
      async recordCorrection() {
        return undefined;
      },
    } as never,
    {
      async query(input: Record<string, unknown>) {
        receivedCandidateNames = Array.isArray(input.candidateNames)
          ? input.candidateNames.map((item) => String(item))
          : undefined;
        return {
          requestId: 'req_confirm',
          market: 'us',
          inputType: 'manual_text',
          queryItems: [],
          candidates: [
            {
              sourceCode: 'usda',
              type: 'prepared_dish',
              displayName: 'Chicken Congee',
              normalizedName: 'chicken congee',
              nutrientsPer100g: {
                caloriesKcal: 80,
                proteinGram: 5,
                fatGram: 2,
                carbsGram: 10,
              },
              confidence: 0.88,
              verifiedLevel: 'provider_verified',
            },
          ],
          selected: {
            sourceCode: 'usda',
            type: 'prepared_dish',
            displayName: 'Chicken Congee',
            normalizedName: 'chicken congee',
            nutrientsPer100g: {
              caloriesKcal: 80,
              proteinGram: 5,
              fatGram: 2,
              carbsGram: 10,
            },
            nutrientsPerServing: {
              caloriesKcal: 144,
              proteinGram: 9,
              fatGram: 3.6,
              carbsGram: 18,
            },
            confidence: 0.88,
            verifiedLevel: 'provider_verified',
          },
          routing: {
            routeKey: 'default',
            providerCodes: ['internal', 'usda'],
            queryNames: ['鸡肉粥', 'Chicken Congee'],
          },
          recognition: {
            provider: 'usda',
            status: 'success',
            confidence: 0.88,
          },
        } satisfies FoodQueryResult;
      },
    } as never,
    {
      async persistConfirmedFood() {
        return { foodId: 'food_1' };
      },
    } as never,
    {
      isEnabled() {
        return false;
      },
    } as never,
    {} as never,
  );

  await service.confirmFoodItem({
    mealRecordId: 'meal_1',
    itemId: 'item_1',
    userId: 'user_1',
    foodName: '鸡肉粥',
    requestId: 'req_confirm',
  });

  assert.deepEqual(receivedCandidateNames, [
    '鸡肉粥',
    'Chicken Congee',
    'Chicken Rice Porridge',
  ]);
});

function matchesWhere(item: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, expected]) => matchesValue(item[key], expected));
}

function matchesValue(actual: unknown, expected: unknown): boolean {
  if (isFindOperator(expected) && expected._type === 'in') {
    return expected._value.includes(actual);
  }
  return actual === expected;
}

function isFindOperator(value: unknown): value is { _type: string; _value: unknown[] } {
  return typeof value === 'object'
    && value !== null
    && '_type' in value
    && '_value' in value
    && Array.isArray((value as { _value: unknown })._value);
}
