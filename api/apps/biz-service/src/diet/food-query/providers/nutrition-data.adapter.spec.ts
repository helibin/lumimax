import assert from 'node:assert/strict';
import test from 'node:test';
import { FoodIdentityService } from '../../food/food-identity.service';
import type { NutritionDataProvider } from '../../interfaces/provider.contracts';
import { NutritionDataProviderAdapter } from './nutrition-data.adapter';

test('NutritionDataProviderAdapter stops detail lookups after a high-confidence provider match', async () => {
  const nutritionCalls: string[] = [];
  const adapter = new NutritionDataProviderAdapter(
    'usda_fdc',
    {
      async searchFood() {
        return {
          items: [
            { id: '1', name: 'White Rice', source: 'usda_fdc', raw: { fdcId: 1 } },
            { id: '2', name: 'Brown Rice', source: 'usda_fdc', raw: { fdcId: 2 } },
            { id: '3', name: 'Rice Noodles', source: 'usda_fdc', raw: { fdcId: 3 } },
          ],
        };
      },
      async getNutrition(input: { id?: string; searchHits?: unknown[] }) {
        nutritionCalls.push(input.id ?? '');
        assert.ok(Array.isArray(input.searchHits));
        assert.equal(input.searchHits?.length, 3);
        return {
          name: 'White Rice',
          calories: 130,
          protein: 2.7,
          fat: 0.3,
          carbs: 28.2,
          source: 'usda_fdc',
          raw: { id: input.id },
        };
      },
    } satisfies NutritionDataProvider,
    new FoodIdentityService(),
    () => true,
  );

  const candidates = await adapter.search({
    query: 'white rice',
    requestId: 'req_provider_fast_stop',
  });

  assert.deepEqual(nutritionCalls, ['1']);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.displayName, 'White Rice');
  assert.equal(candidates[0]?.verifiedLevel, 'provider_verified');
  assert.ok((candidates[0]?.confidence ?? 0) >= 0.9);
});
