import assert from 'node:assert/strict';
import test from 'node:test';
import { FoodIdentityService } from '../../food/food-identity.service';
import type { NutritionDataProvider } from '../../interfaces/provider.contracts';
import { NutritionDataProviderAdapter } from './nutrition-data.adapter';

test('NutritionDataProviderAdapter keeps english provider name for zh client without localized fields', async () => {
  const adapter = new NutritionDataProviderAdapter(
    'usda',
    {
      async searchFood() {
        return {
          items: [
            {
              id: '2087961',
              name: 'KIRKLAND SIGNATURE, STRAWBERRY SPREAD',
              source: 'usda_fdc',
              raw: {
                fdcId: 2087961,
                description: 'KIRKLAND SIGNATURE, STRAWBERRY SPREAD',
              },
            },
          ],
        };
      },
      async getNutrition() {
        return {
          name: 'KIRKLAND SIGNATURE, STRAWBERRY SPREAD',
          calories: 250,
          protein: 0.5,
          fat: 0.2,
          carbs: 60,
          source: 'usda_fdc',
          raw: {
            fdcId: 2087961,
            description: 'KIRKLAND SIGNATURE, STRAWBERRY SPREAD',
          },
        };
      },
    } satisfies NutritionDataProvider,
    new FoodIdentityService(),
    () => true,
  );

  const candidates = await adapter.search({
    query: '草莓',
    alternateQueries: ['Strawberry', 'KIRKLAND SIGNATURE, STRAWBERRY SPREAD'],
    locale: 'zh-CN',
    market: 'CN',
    countryCode: 'CN',
    requestId: 'req_provider_localization',
  });

  assert.equal(candidates[0]?.displayName, 'KIRKLAND SIGNATURE, STRAWBERRY SPREAD');
});
