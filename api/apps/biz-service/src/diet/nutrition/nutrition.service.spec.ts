import assert from 'node:assert/strict';
import test from 'node:test';
import { pickLocalizedFoodName } from './nutrition-localization.util';

test('pickLocalizedFoodName prefers localized provider field for zh locale', () => {
  const result = pickLocalizedFoodName({
    locale: 'zh-CN',
    fallbackName: 'Fromage Blanc Nature',
    raw: {
      nutrition: {
        product_name: 'Fromage Blanc Nature',
        product_name_zh: '原味白奶酪',
      },
    },
  });

  assert.equal(result, '原味白奶酪');
});

test('pickLocalizedFoodName uses chinese query alias only when explicitly allowed', () => {
  const result = pickLocalizedFoodName({
    locale: 'zh-CN',
    fallbackName: 'Fromage Blanc Nature',
    queryName: '原味奶酪',
    aliases: ['Fromage Blanc Nature', '原味奶酪'],
    allowQueryAliasFallback: true,
  });

  assert.equal(result, '原味奶酪');
});

test('pickLocalizedFoodName keeps provider english name for zh locale without localized fields', () => {
  const result = pickLocalizedFoodName({
    locale: 'zh-CN',
    fallbackName: 'KIRKLAND SIGNATURE, STRAWBERRY SPREAD',
    queryName: '草莓',
    aliases: ['Strawberry Spread'],
  });

  assert.equal(result, 'KIRKLAND SIGNATURE, STRAWBERRY SPREAD');
});

test('pickLocalizedFoodName keeps fallback name when no localized candidate exists', () => {
  const result = pickLocalizedFoodName({
    locale: 'en-US',
    fallbackName: 'Fromage Blanc Nature',
    queryName: 'Fromage Blanc Nature',
  });

  assert.equal(result, 'Fromage Blanc Nature');
});
