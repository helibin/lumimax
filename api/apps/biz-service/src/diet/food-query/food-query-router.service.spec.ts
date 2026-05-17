import assert from 'node:assert/strict';
import test from 'node:test';
import { FoodQueryRouterService } from './food-query-router.service';

test('router prioritizes nutrition label OCR for nutrition_label images', () => {
  const service = new FoodQueryRouterService(
    {
      resolveProviderCodes() {
        return ['vision', 'internal', 'nutrition_label_ocr', 'edamam', 'llm_estimate'];
      },
    } as never,
    {
      isEnabled() {
        return true;
      },
    } as never,
  );

  const result = service.resolveExecutionChain({
    market: 'us',
    inputType: 'image',
    foodType: 'packaged_food',
    imageType: 'nutrition_label',
  });

  assert.deepEqual(result, {
    routeKey: 'packaged_food',
    providerCodes: ['nutrition_label_ocr', 'vision', 'internal', 'edamam', 'llm_estimate'],
  });
});

test('router prioritizes nutrition label OCR for packaged food front images', () => {
  const service = new FoodQueryRouterService(
    {
      resolveProviderCodes() {
        return ['vision', 'internal', 'nutrition_label_ocr', 'edamam', 'llm_estimate'];
      },
    } as never,
    {
      isEnabled() {
        return true;
      },
    } as never,
  );

  const result = service.resolveExecutionChain({
    market: 'us',
    inputType: 'image',
    foodType: 'packaged_food',
    imageType: 'packaged_food_front',
  });

  assert.deepEqual(result, {
    routeKey: 'packaged_food',
    providerCodes: ['nutrition_label_ocr', 'vision', 'internal', 'edamam', 'llm_estimate'],
  });
});
