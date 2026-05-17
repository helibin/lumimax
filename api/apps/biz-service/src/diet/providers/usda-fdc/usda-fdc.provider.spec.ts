import assert from 'node:assert/strict';
import test from 'node:test';
import { UsdaFdcProvider } from './usda-fdc.provider';

function createMockHttpClient(handlers: {
  getJson?: (input: { url: string }) => Promise<unknown>;
  tryGetJson?: (input: { url: string }) => Promise<unknown | null>;
}) {
  return {
    async getJson(input: { url: string }) {
      if (handlers.getJson) {
        return handlers.getJson(input);
      }
      throw new Error(`unexpected getJson: ${input.url}`);
    },
    async tryGetJson(input: { url: string }) {
      if (handlers.tryGetJson) {
        return handlers.tryGetJson(input);
      }
      return handlers.getJson?.(input) ?? null;
    },
  };
}

test('usda getNutrition uses search row nutrients when detail endpoint returns 404', async () => {
  const originalApiKey = process.env.USDA_FDC_API_KEY;
  process.env.USDA_FDC_API_KEY = 'demo-usda-key';

  const searchHit = {
    fdcId: 167782,
    description: 'Rice, white, cooked',
    foodNutrients: [
      { nutrientName: 'Energy', value: 130 },
      { nutrientName: 'Protein', value: 2.7 },
      { nutrientName: 'Total lipid (fat)', value: 0.3 },
      { nutrientName: 'Carbohydrate, by difference', value: 28.2 },
    ],
  };
  const detailCalls: string[] = [];
  const searchCalls: string[] = [];
  const provider = new UsdaFdcProvider(
    createMockHttpClient({
      tryGetJson: async (input) => {
        detailCalls.push(input.url);
        if (input.url.includes('/food/167782')) {
          return null;
        }
        return null;
      },
      getJson: async (input) => {
        searchCalls.push(input.url);
        return { foods: [searchHit] };
      },
    }) as never,
  );

  try {
    const result = await provider.getNutrition({
      id: '167782',
      query: 'Rice, white, cooked',
      raw: searchHit,
      searchHits: [searchHit],
      requestId: 'req_usda_fallback',
    });

    assert.equal(searchCalls.length, 0);
    assert.equal(detailCalls.length, 0);
    assert.deepEqual(result, {
      name: 'Rice, white, cooked',
      calories: 130,
      protein: 2.7,
      fat: 0.3,
      carbs: 28.2,
      fiber: 0,
      sodium: 0,
      source: 'usda_fdc',
      raw: {
        fdcId: 167782,
        description: 'Rice, white, cooked',
        foodNutrients: [
          { nutrientName: 'Energy', value: 130 },
          { nutrientName: 'Protein', value: 2.7 },
          { nutrientName: 'Total lipid (fat)', value: 0.3 },
          { nutrientName: 'Carbohydrate, by difference', value: 28.2 },
        ],
      },
    });
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.USDA_FDC_API_KEY;
    } else {
      process.env.USDA_FDC_API_KEY = originalApiKey;
    }
  }
});

test('usda getNutrition reuses searchHits without a second search request', async () => {
  const originalApiKey = process.env.USDA_FDC_API_KEY;
  process.env.USDA_FDC_API_KEY = 'demo-usda-key';

  const searchCalls: string[] = [];
  const detailCalls: string[] = [];
  const searchHits = [
    { fdcId: 2060621, description: 'Stale hit' },
    {
      fdcId: 2087961,
      description: 'KIRKLAND SIGNATURE, STRAWBERRY SPREAD',
      foodNutrients: [
        { nutrientName: 'Energy', value: 250 },
        { nutrientName: 'Protein', value: 0.5 },
        { nutrientName: 'Total lipid (fat)', value: 0.2 },
        { nutrientName: 'Carbohydrate, by difference', value: 60 },
      ],
    },
  ];

  const provider = new UsdaFdcProvider(
    createMockHttpClient({
      tryGetJson: async (input) => {
        detailCalls.push(input.url);
        return null;
      },
      getJson: async (input) => {
        searchCalls.push(input.url);
        return { foods: searchHits };
      },
    }) as never,
  );

  try {
    const result = await provider.getNutrition({
      id: '2060621',
      query: 'kirkland signature almond milk chocolate',
      raw: searchHits[0],
      searchHits,
      requestId: 'req_usda_search_hits',
    });

    assert.equal(searchCalls.length, 0);
    assert.deepEqual(detailCalls, [expectDetailUrl('2060621')]);
    assert.equal(result.name, 'KIRKLAND SIGNATURE, STRAWBERRY SPREAD');
    assert.equal(result.calories, 250);
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.USDA_FDC_API_KEY;
    } else {
      process.env.USDA_FDC_API_KEY = originalApiKey;
    }
  }
});

test('usda getNutrition tries next search candidate when preferred fdcId detail is missing', async () => {
  const originalApiKey = process.env.USDA_FDC_API_KEY;
  process.env.USDA_FDC_API_KEY = 'demo-usda-key';

  const searchCalls: string[] = [];
  const detailCalls: string[] = [];
  const searchHits = [
    { fdcId: 2060621, description: 'Stale search hit without nutrients' },
    { fdcId: 2087961, description: 'KIRKLAND SIGNATURE, STRAWBERRY SPREAD' },
  ];
  const provider = new UsdaFdcProvider(
    createMockHttpClient({
      tryGetJson: async (input) => {
        detailCalls.push(input.url);
        if (input.url.includes('/food/2060621')) {
          return null;
        }
        if (input.url.includes('/food/2087961')) {
          return {
            fdcId: 2087961,
            description: 'KIRKLAND SIGNATURE, STRAWBERRY SPREAD',
            foodNutrients: [
              { nutrientName: 'Energy', value: 250 },
              { nutrientName: 'Protein', value: 0.5 },
              { nutrientName: 'Total lipid (fat)', value: 0.2 },
              { nutrientName: 'Carbohydrate, by difference', value: 60 },
            ],
          };
        }
        return null;
      },
      getJson: async (input) => {
        searchCalls.push(input.url);
        return { foods: searchHits };
      },
    }) as never,
  );

  try {
    const result = await provider.getNutrition({
      id: '2060621',
      query: 'kirkland signature almond milk chocolate',
      raw: searchHits[0],
      searchHits,
      requestId: 'req_usda_multi_candidate',
    });

    assert.equal(searchCalls.length, 0);
    assert.deepEqual(detailCalls, [
      expectDetailUrl('2060621'),
      expectDetailUrl('2087961'),
    ]);
    assert.equal(result.name, 'KIRKLAND SIGNATURE, STRAWBERRY SPREAD');
    assert.equal(result.calories, 250);
    assert.equal(result.source, 'usda_fdc');
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.USDA_FDC_API_KEY;
    } else {
      process.env.USDA_FDC_API_KEY = originalApiKey;
    }
  }
});

test('usda fallback search uses US-market english query when searchHits are missing', async () => {
  const originalApiKey = process.env.USDA_FDC_API_KEY;
  process.env.USDA_FDC_API_KEY = 'demo-usda-key';

  const searchCalls: string[] = [];
  const provider = new UsdaFdcProvider(
    createMockHttpClient({
      tryGetJson: async () => null,
      getJson: async (input) => {
        searchCalls.push(input.url);
        return {
          foods: [
            {
              fdcId: 2087961,
              description: 'KIRKLAND SIGNATURE, STRAWBERRY SPREAD',
              foodNutrients: [{ nutrientName: 'Energy', value: 250 }],
            },
          ],
        };
      },
    }) as never,
  );

  try {
    await provider.getNutrition({
      id: '2060621',
      query: '草莓',
      alternateQueries: ['KIRKLAND SIGNATURE, STRAWBERRY SPREAD'],
      market: 'US',
      requestId: 'req_usda_fallback_query',
    });

    assert.equal(searchCalls.length, 1);
    assert.match(searchCalls[0]!, /query=KIRKLAND\+SIGNATURE%2C\+STRAWBERRY\+SPREAD/);
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.USDA_FDC_API_KEY;
    } else {
      process.env.USDA_FDC_API_KEY = originalApiKey;
    }
  }
});

function expectDetailUrl(fdcId: string): string {
  return `https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=demo-usda-key`;
}
