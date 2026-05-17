import assert from 'node:assert/strict';
import test from 'node:test';
import { BooheeProvider } from './boohee.provider';

test('boohee searchFood maps flexible list response', async () => {
  const originalEnv = snapshotEnv([
    'BOOHEE_BASE_URL',
    'BOOHEE_APP_ID',
    'BOOHEE_APP_KEY',
    'BOOHEE_SEARCH_PATH',
    'BOOHEE_DETAIL_PATH',
    'BOOHEE_TIMEOUT_MS',
  ]);
  process.env.BOOHEE_BASE_URL = 'https://boohee.example.com';
  process.env.BOOHEE_APP_ID = 'demo-app-id';
  process.env.BOOHEE_APP_KEY = 'demo-app-key';
  process.env.BOOHEE_SEARCH_PATH = '/open/foods/search';
  process.env.BOOHEE_TIMEOUT_MS = '4321';

  const calls: Array<{ url: string; headers?: Record<string, string>; timeoutMs?: number }> = [];
  const provider = new BooheeProvider({
    async getJson(input: { url: string; headers?: Record<string, string>; timeoutMs?: number }) {
      calls.push(input);
      return {
        data: {
          items: [
            {
              food_id: 'rice_1',
              food_name: '米饭',
              brand_name: '薄荷样例',
            },
          ],
        },
      };
    },
  } as never);

  try {
    const result = await provider.searchFood({
      query: '米饭',
      requestId: 'req_boohee_search',
    });

    assert.equal(calls.length, 1);
    const calledUrl = new URL(calls[0]!.url);
    assert.equal(calledUrl.origin, 'https://boohee.example.com');
    assert.equal(calledUrl.pathname, '/open/foods/search');
    assert.equal(calledUrl.searchParams.get('q'), '米饭');
    assert.equal(calledUrl.searchParams.get('query'), '米饭');
    assert.equal(calledUrl.searchParams.get('app_id'), 'demo-app-id');
    assert.equal(calledUrl.searchParams.get('app_key'), 'demo-app-key');
    assert.deepEqual(calls[0]!.headers, {
      'x-app-id': 'demo-app-id',
      'x-app-key': 'demo-app-key',
    });
    assert.equal(calls[0]!.timeoutMs, 4321);
    assert.deepEqual(result, {
      items: [
        {
          id: 'rice_1',
          name: '米饭',
          brandName: '薄荷样例',
          source: 'boohee',
          raw: {
            food_id: 'rice_1',
            food_name: '米饭',
            brand_name: '薄荷样例',
          },
        },
      ],
    });
  } finally {
    restoreEnv(originalEnv);
  }
});

test('boohee getNutrition maps nested nutrient payload', async () => {
  const originalEnv = snapshotEnv([
    'BOOHEE_BASE_URL',
    'BOOHEE_APP_ID',
    'BOOHEE_APP_KEY',
    'BOOHEE_SEARCH_PATH',
    'BOOHEE_DETAIL_PATH',
    'BOOHEE_TIMEOUT_MS',
  ]);
  process.env.BOOHEE_BASE_URL = 'https://boohee.example.com';
  process.env.BOOHEE_APP_ID = 'demo-app-id';
  process.env.BOOHEE_APP_KEY = 'demo-app-key';
  process.env.BOOHEE_DETAIL_PATH = '/open/foods/{id}';

  const calls: string[] = [];
  const provider = new BooheeProvider({
    async getJson(input: { url: string }) {
      calls.push(input.url);
      return {
        data: {
          food: {
            id: 'rice_1',
            name: '米饭',
            nutrition: {
              calories: '116',
              protein: 2.6,
              fat: 0.3,
              carbs: '25.9',
              fiber: '0.3',
              sodium: 2,
            },
          },
        },
      };
    },
  } as never);

  try {
    const result = await provider.getNutrition({
      id: 'rice_1',
      query: '米饭',
      requestId: 'req_boohee_detail',
    });

    assert.equal(calls.length, 1);
    const calledUrl = new URL(calls[0]!);
    assert.equal(calledUrl.pathname, '/open/foods/rice_1');
    assert.equal(calledUrl.searchParams.get('app_id'), 'demo-app-id');
    assert.equal(calledUrl.searchParams.get('app_key'), 'demo-app-key');
    assert.deepEqual(result, {
      name: '米饭',
      calories: 116,
      protein: 2.6,
      fat: 0.3,
      carbs: 25.9,
      fiber: 0.3,
      sodium: 2,
      source: 'boohee',
      raw: {
        data: {
          food: {
            id: 'rice_1',
            name: '米饭',
            nutrition: {
              calories: '116',
              protein: 2.6,
              fat: 0.3,
              carbs: '25.9',
              fiber: '0.3',
              sodium: 2,
            },
          },
        },
      },
    });
  } finally {
    restoreEnv(originalEnv);
  }
});

function snapshotEnv(keys: string[]): Record<string, string | undefined> {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
}
