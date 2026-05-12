import assert from 'node:assert/strict';
import test from 'node:test';
import { NutritionDataProviderFactory } from './nutrition-data-provider.factory';

test('nutritionix is skipped when app id is missing', () => {
  const restore = stashEnv([
    ['NUTRITION_DATA_PROVIDERS', 'nutritionix,usda_fdc,edamam'],
    ['NUTRITIONIX_APP_ID', ''],
    ['NUTRITIONIX_API_KEY', ''],
  ]);
  try {
    const factory = new NutritionDataProviderFactory(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    assert.deepEqual(factory.resolveEnabledNames(['nutritionix', 'usda_fdc', 'edamam']), [
      'usda_fdc',
      'edamam',
    ]);
    assert.throws(() => factory.resolve('nutritionix'), /因缺少配置已被禁用/);
  } finally {
    restore();
  }
});

test('nutritionix remains enabled when credentials are complete', () => {
  const restore = stashEnv([
    ['NUTRITIONIX_APP_ID', 'demo-app-id'],
    ['NUTRITIONIX_API_KEY', 'demo-api-key'],
  ]);
  try {
    const factory = new NutritionDataProviderFactory(
      { searchFood: async () => ({ items: [] }), getNutrition: async () => ({ name: '', calories: 0, protein: 0, fat: 0, carbs: 0, source: 'nutritionix' }) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    assert.deepEqual(factory.resolveEnabledNames(['nutritionix', 'usda_fdc']), [
      'nutritionix',
      'usda_fdc',
    ]);
  } finally {
    restore();
  }
});

test('boohee remains resolvable as CN realtime placeholder', () => {
  const factory = new NutritionDataProviderFactory(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  assert.deepEqual(factory.resolveEnabledNames(['boohee', 'usda_fdc', 'edamam']), [
    'boohee',
    'usda_fdc',
    'edamam',
  ]);
});

function stashEnv(entries: Array<[string, string]>): () => void {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of entries) {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  }
  return () => {
    for (const [name, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  };
}
