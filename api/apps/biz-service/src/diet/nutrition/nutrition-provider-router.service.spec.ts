import assert from 'node:assert/strict';
import test from 'node:test';
import { NutritionProviderRouterService } from './nutrition-provider-router.service';

test('NutritionProviderRouterService prefers explicit market for text flow', () => {
  const service = new NutritionProviderRouterService();
  const plan = service.resolvePlan({
    market: 'US',
    locale: 'zh-CN',
    hasText: true,
  });

  assert.equal(plan.market, 'US');
  assert.equal(plan.routeKey, 'us-text');
  assert.deepEqual(plan.providerNames, ['edamam', 'usda_fdc']);
});

test('NutritionProviderRouterService falls back to DEFAULT_MARKET when market is absent', () => {
  const service = new NutritionProviderRouterService();
  const plan = service.resolvePlan({
    locale: 'zh-CN',
    hasImage: true,
  });

  assert.equal(plan.market, 'US');
  assert.equal(plan.routeKey, 'us-image');
  assert.deepEqual(plan.providerNames, ['usda_fdc', 'edamam']);
});

test('NutritionProviderRouterService uses US barcode chain when market is US', () => {
  const service = new NutritionProviderRouterService();
  const plan = service.resolvePlan({
    market: 'US',
    hasBarcode: true,
  });

  assert.equal(plan.market, 'US');
  assert.equal(plan.routeKey, 'us-barcode');
  assert.deepEqual(plan.providerNames, ['edamam']);
});

test('NutritionProviderRouterService keeps boohee as CN text placeholder while removing OFF from realtime route', () => {
  const service = new NutritionProviderRouterService();
  const plan = service.resolvePlan({
    market: 'CN',
    hasText: true,
  });

  assert.equal(plan.market, 'CN');
  assert.equal(plan.routeKey, 'cn-text');
  assert.deepEqual(plan.providerNames, ['boohee', 'usda_fdc']);
});

test('NutritionProviderRouterService keeps CN barcode route free of OFF realtime lookup', () => {
  const service = new NutritionProviderRouterService();
  const plan = service.resolvePlan({
    market: 'CN',
    hasBarcode: true,
  });

  assert.equal(plan.market, 'CN');
  assert.equal(plan.routeKey, 'cn-barcode');
  assert.deepEqual(plan.providerNames, ['boohee']);
});
