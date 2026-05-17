import assert from 'node:assert/strict';
import test from 'node:test';
import { FoodIdentityService } from '../../food/food-identity.service';
import { NutritionLabelOcrProvider } from './nutrition-label-ocr.provider';

test('nutrition label provider parses image with active vision provider first', async () => {
  const originalEnv = process.env.FOOD_QUERY_ENABLE_NUTRITION_LABEL_OCR;
  process.env.FOOD_QUERY_ENABLE_NUTRITION_LABEL_OCR = 'true';

  const provider = new NutritionLabelOcrProvider(
    new FoodIdentityService(),
    {
      resolveActive() {
        return {
          name: 'openai',
          provider: {
            async parseNutritionLabel() {
              return {
                labelFound: true,
                productName: 'Protein Bar',
                brandName: 'Demo Brand',
                servingSizeText: '1 bar (50 g)',
                servingWeightGram: 50,
                calories: 210,
                protein: 20,
                fat: 7,
                carbs: 18,
                fiber: 8,
                sodiumMg: 180,
                confidence: 0.97,
              };
            },
          },
        };
      },
    } as never,
  );

  try {
    const result = await provider.search({
      query: 'Nutrition Facts',
      locale: 'en-US',
      countryCode: 'US',
      requestId: 'req_label_image',
      imageUrl: 'https://example.com/label.png',
      imageType: 'nutrition_label',
    });

    assert.equal(result.length, 1);
    assert.equal(result[0]?.displayName, 'Protein Bar');
    assert.equal(result[0]?.brandName, 'Demo Brand');
    assert.equal(result[0]?.servingWeightGram, 50);
    assert.deepEqual(result[0]?.nutrientsPerServing, {
      caloriesKcal: 210,
      proteinGram: 20,
      fatGram: 7,
      carbsGram: 18,
    });
    assert.deepEqual(result[0]?.nutrientsPer100g, {
      caloriesKcal: 420,
      proteinGram: 40,
      fatGram: 14,
      carbsGram: 36,
    });
    assert.equal(result[0]?.confidence, 0.97);
    assert.deepEqual(result[0]?.rawPayload, {
      parser: 'vision_model',
      imageType: 'nutrition_label',
      sourceText: 'Nutrition Facts',
      servingsPerContainer: undefined,
      fiber: 8,
      sodiumMg: 180,
      raw: undefined,
    });
  } finally {
    if (originalEnv === undefined) {
      delete process.env.FOOD_QUERY_ENABLE_NUTRITION_LABEL_OCR;
    } else {
      process.env.FOOD_QUERY_ENABLE_NUTRITION_LABEL_OCR = originalEnv;
    }
  }
});

test('nutrition label provider falls back to text parsing when image parser is unavailable', async () => {
  const originalEnv = process.env.FOOD_QUERY_ENABLE_NUTRITION_LABEL_OCR;
  process.env.FOOD_QUERY_ENABLE_NUTRITION_LABEL_OCR = 'true';

  const provider = new NutritionLabelOcrProvider(
    new FoodIdentityService(),
    {
      resolveActive() {
        return {
          name: 'openai',
          provider: {},
        };
      },
    } as never,
  );

  try {
    const result = await provider.search({
      query: 'Calories 200 Protein 10g Total Fat 8g Total Carbohydrate 22g Serving Size 40 g',
      locale: 'en-US',
      countryCode: 'US',
      requestId: 'req_label_text',
      imageType: 'nutrition_label',
    });

    assert.equal(result.length, 1);
    assert.equal(result[0]?.servingWeightGram, 40);
    assert.equal(result[0]?.confidence, 0.93);
    assert.deepEqual(result[0]?.nutrientsPer100g, {
      caloriesKcal: 500,
      proteinGram: 25,
      fatGram: 20,
      carbsGram: 55,
    });
  } finally {
    if (originalEnv === undefined) {
      delete process.env.FOOD_QUERY_ENABLE_NUTRITION_LABEL_OCR;
    } else {
      process.env.FOOD_QUERY_ENABLE_NUTRITION_LABEL_OCR = originalEnv;
    }
  }
});
