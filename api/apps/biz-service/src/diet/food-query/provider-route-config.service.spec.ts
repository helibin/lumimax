import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseProviderRoutesYaml,
  resolveRouteKey,
} from './provider-route-config.util';

test('parseProviderRoutesYaml reads cn/us provider order', () => {
  const config = parseProviderRoutesYaml(`
version: v4
routes:
  cn:
    default:
      - internal
      - boohee
  us:
    ingredient:
      - internal
      - usda
      - edamam
`);
  assert.ok(config);
  assert.deepEqual(config.routes.cn.default, ['internal', 'boohee']);
  assert.deepEqual(config.routes.us.ingredient, ['internal', 'usda', 'edamam']);
});

test('resolveRouteKey prefers food type and barcode', () => {
  assert.equal(
    resolveRouteKey({ inputType: 'manual_text', foodType: 'prepared_dish' }),
    'prepared_dish',
  );
  assert.equal(
    resolveRouteKey({ inputType: 'barcode', hasBarcode: true }),
    'packaged_food',
  );
});
