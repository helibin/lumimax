import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveProviderSearchQuery } from './provider-search-query.util';

test('resolveProviderSearchQuery primary keeps the main query', () => {
  assert.equal(
    resolveProviderSearchQuery({
      query: '草莓',
      alternateQueries: ['Strawberry'],
      role: 'primary',
      market: 'CN',
    }),
    '草莓',
  );
});

test('resolveProviderSearchQuery fallback prefers Chinese on CN market', () => {
  assert.equal(
    resolveProviderSearchQuery({
      query: 'Strawberry Spread',
      alternateQueries: ['草莓酱', 'kirkland signature'],
      role: 'fallback',
      market: 'CN',
    }),
    '草莓酱',
  );
});

test('resolveProviderSearchQuery fallback prefers English on US market', () => {
  assert.equal(
    resolveProviderSearchQuery({
      query: '草莓',
      alternateQueries: ['KIRKLAND SIGNATURE, STRAWBERRY SPREAD'],
      role: 'fallback',
      market: 'US',
    }),
    'KIRKLAND SIGNATURE, STRAWBERRY SPREAD',
  );
});
