import assert from 'node:assert/strict';
import test from 'node:test';
import { FoodQueryService } from './food-query.service';

test('image query stops immediately when vision provider fails', async () => {
  let internalCalled = false;
  const service = new FoodQueryService(
    { log() {}, warn() {} } as never,
    {
      buildSearchTerms() { return []; },
      scoreNameMatch() { return 0; },
    } as never,
    { async findCommonFoods() { return []; } } as never,
    {
      get(code: string) {
        if (code === 'vision') {
          return {
            code: 'vision',
            isEnabled() {
              return true;
            },
            async recognizeImage() {
              throw new Error('vision timeout');
            },
          };
        }
        return {
          code,
          isEnabled() {
            return true;
          },
          async search() {
            internalCalled = true;
            return [];
          },
        };
      },
    } as never,
    {
      resolveExecutionChain() {
        return { routeKey: 'default', providerCodes: ['vision', 'internal'] };
      },
    } as never,
    { scalePer100g() { return { calories: 0, protein: 0, fat: 0, carbs: 0 }; } } as never,
    { rankCandidates() { return []; } } as never,
  );

  await assert.rejects(
    () =>
      service.query({
        requestId: 'req_vision_fail',
        tenantId: 'tenant_1',
        market: 'cn',
        inputType: 'image',
        imageUrl: 'https://example.com/demo.png',
      }),
    /food-query vision failed requestId=req_vision_fail: vision timeout/,
  );
  assert.equal(internalCalled, false);
});

test('image query reroutes by imageType after vision classification', async () => {
  const providerCalls: string[] = [];
  const routingContexts: Array<{ inputType: string; foodType: string; imageType?: string }> = [];
  const service = new FoodQueryService(
    { log() {}, warn() {} } as never,
    {
      buildSearchTerms({ name }: { name: string }) {
        return [name];
      },
      scoreNameMatch() {
        return 1;
      },
    } as never,
    { async findCommonFoods() { return []; } } as never,
    {
      get(code: string) {
        if (code === 'vision') {
          return {
            code: 'vision',
            isEnabled() {
              return true;
            },
            async recognizeImage() {
              providerCalls.push('vision');
              return {
                imageType: 'nutrition_label',
                items: [
                  {
                    type: 'packaged_food',
                    name: 'Nutrition Facts',
                    confidence: 0.93,
                  },
                ],
              };
            },
          };
        }
        if (code === 'nutrition_label_ocr') {
          return {
            code,
            isEnabled() {
              return true;
            },
            async search() {
              providerCalls.push(code);
              return [
                {
                  sourceCode: code,
                  type: 'packaged_food',
                  displayName: 'Protein Bar',
                  normalizedName: 'protein bar',
                  nutrientsPer100g: {
                    caloriesKcal: 400,
                    proteinGram: 20,
                    fatGram: 10,
                    carbsGram: 30,
                  },
                  confidence: 0.93,
                  verifiedLevel: 'provider_verified',
                  rawPayload: {
                    parser: 'vision_model',
                    sourceText: 'Nutrition Facts',
                    raw: {
                      labelFound: true,
                      calories: 200,
                    },
                  },
                },
              ];
            },
          };
        }
        return {
          code,
          isEnabled() {
            return true;
          },
          async search() {
            providerCalls.push(code);
            return [];
          },
        };
      },
    } as never,
    {
      resolveExecutionChain(context: { inputType: string; foodType: string; imageType?: string }) {
        routingContexts.push(context);
        if (context.imageType === 'nutrition_label') {
          return {
            routeKey: 'packaged_food',
            providerCodes: ['vision', 'nutrition_label_ocr', 'internal', 'llm_estimate'],
          };
        }
        return { routeKey: 'default', providerCodes: ['vision', 'internal', 'llm_estimate'] };
      },
    } as never,
    {
      scalePer100g() {
        return { calories: 400, protein: 20, fat: 10, carbs: 30 };
      },
    } as never,
    {
      rankCandidates(candidates: unknown[]) {
        return candidates;
      },
    } as never,
  );

  const result = await service.query({
    requestId: 'req_image_reroute',
    tenantId: 'tenant_1',
    market: 'us',
    inputType: 'image',
    imageUrl: 'https://example.com/nutrition-label.png',
  });

  assert.deepEqual(providerCalls, ['vision', 'nutrition_label_ocr']);
  assert.equal(routingContexts.at(-1)?.imageType, 'nutrition_label');
  assert.equal(result.routing.routeKey, 'packaged_food');
  assert.equal(result.recognition?.imageType, 'nutrition_label');
  assert.equal(result.selected?.sourceCode, 'nutrition_label_ocr');
  assert.equal(result.debug?.providerTraces.length, 2);
  assert.equal(result.debug?.providerTraces[1]?.provider, 'nutrition_label_ocr');
  assert.equal(
    (
      result.debug?.providerTraces[1]?.output?.candidates as Array<{ rawPayload?: { parser?: string } }>
      | undefined
    )?.[0]?.rawPayload?.parser,
    'vision_model',
  );
});

test('image query with low recognition confidence skips nutrition lookup providers', async () => {
  const providerCalls: string[] = [];
  const service = new FoodQueryService(
    { log() {}, warn() {} } as never,
    {
      buildSearchTerms({ name }: { name: string }) {
        return [name];
      },
      scoreNameMatch() {
        return 1;
      },
    } as never,
    {
      async findCommonFoods() {
        throw new Error('user common should not be called');
      },
    } as never,
    {
      get(code: string) {
        if (code === 'vision') {
          return {
            code: 'vision',
            isEnabled() {
              return true;
            },
            async recognizeImage() {
              providerCalls.push('vision');
              return {
                imageType: 'food_photo',
                items: [
                  {
                    type: 'prepared_dish',
                    name: 'Chicken Congee',
                    confidence: 0.62,
                  },
                ],
              };
            },
          };
        }
        return {
          code,
          isEnabled() {
            return true;
          },
          async search() {
            providerCalls.push(code);
            return [];
          },
        };
      },
    } as never,
    {
      resolveExecutionChain() {
        return { routeKey: 'default', providerCodes: ['vision', 'internal', 'usda', 'llm_estimate'] };
      },
    } as never,
    { scalePer100g() { return { calories: 0, protein: 0, fat: 0, carbs: 0 }; } } as never,
    {
      rankCandidates() {
        throw new Error('rankCandidates should not be called');
      },
    } as never,
  );

  const result = await service.query({
    requestId: 'req_low_confidence',
    tenantId: 'tenant_1',
    market: 'us',
    inputType: 'image',
    imageUrl: 'https://example.com/meal.png',
  });

  assert.deepEqual(providerCalls, ['vision']);
  assert.equal(result.queryItems[0]?.name, 'Chicken Congee');
  assert.equal(result.candidates.length, 0);
  assert.equal(result.selected, undefined);
  assert.equal(result.recognition?.confidence, 0.62);
  assert.equal(result.debug?.providerTraces.length, 1);
});

test('packaged image coerces recognized ingredient type into packaged_food routing', async () => {
  const providerCalls: string[] = [];
  const routingContexts: Array<{ inputType: string; foodType: string; imageType?: string }> = [];
  const service = new FoodQueryService(
    { log() {}, warn() {} } as never,
    {
      buildSearchTerms({ name }: { name: string }) {
        return [name];
      },
      scoreNameMatch() {
        return 1;
      },
    } as never,
    { async findCommonFoods() { return []; } } as never,
    {
      get(code: string) {
        if (code === 'vision') {
          return {
            code: 'vision',
            isEnabled() {
              return true;
            },
            async recognizeImage() {
              providerCalls.push('vision');
              return {
                imageType: 'packaged_food_front',
                items: [
                  {
                    type: 'ingredient',
                    name: 'Kirkland Signature Almond Milk Chocolate',
                    confidence: 0.97,
                  },
                ],
              };
            },
          };
        }
        if (code === 'nutrition_label_ocr') {
          return {
            code,
            isEnabled() {
              return true;
            },
            async search() {
              providerCalls.push(code);
              return [];
            },
          };
        }
        return {
          code,
          isEnabled() {
            return true;
          },
          async search() {
            providerCalls.push(code);
            return [];
          },
        };
      },
    } as never,
    {
      resolveExecutionChain(context: { inputType: string; foodType: string; imageType?: string }) {
        routingContexts.push(context);
        if (context.imageType === 'packaged_food_front') {
          return {
            routeKey: 'packaged_food',
            providerCodes: ['vision', 'nutrition_label_ocr', 'internal'],
          };
        }
        return { routeKey: 'default', providerCodes: ['vision', 'internal'] };
      },
    } as never,
    {
      scalePer100g() {
        return { calories: 0, protein: 0, fat: 0, carbs: 0 };
      },
    } as never,
    {
      rankCandidates(candidates: unknown[]) {
        return candidates;
      },
    } as never,
  );

  const result = await service.query({
    requestId: 'req_packaged_front',
    tenantId: 'tenant_1',
    market: 'us',
    inputType: 'image',
    imageUrl: 'https://example.com/packaged-food.png',
  });

  assert.deepEqual(providerCalls, ['vision', 'nutrition_label_ocr', 'internal']);
  assert.equal(routingContexts.at(-1)?.imageType, 'packaged_food_front');
  assert.equal(routingContexts.at(-1)?.foodType, 'packaged_food');
  assert.equal(result.queryItems[0]?.type, 'packaged_food');
  assert.equal(result.recognition?.imageType, 'packaged_food_front');
  assert.equal(result.routing.routeKey, 'packaged_food');
});
