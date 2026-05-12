import { Inject, Injectable } from '@nestjs/common';
import { getEnvNumber, getEnvString } from '@lumimax/config';
import { DietProviderHttpClient } from '../provider-http.client';
import type {
  GetNutritionInput,
  NutritionDataProvider,
  NutritionResult,
  NutritionSearchResult,
  SearchFoodInput,
} from '../../interfaces/provider.contracts';

@Injectable()
export class OpenFoodFactsProvider implements NutritionDataProvider {
  constructor(
    @Inject(DietProviderHttpClient) private readonly httpClient: DietProviderHttpClient,
  ) {}

  async searchFood(input: SearchFoodInput): Promise<NutritionSearchResult> {
    const response = await this.httpClient.getJson<OpenFoodFactsSearchResponse>({
      url: `${this.baseUrl()}/api/v2/search?search_terms=${encodeURIComponent(input.query)}&fields=${encodeURIComponent(OPEN_FOOD_FACTS_FIELDS)}&page_size=8`,
      timeoutMs: this.timeoutMs(),
      requestId: input.requestId,
    });

    return {
      items: (response.products ?? [])
        .map((item) => ({
          id: String(item.code ?? '').trim(),
          name: String(item.product_name ?? '').trim(),
          brandName: typeof item.brands === 'string' ? item.brands : undefined,
          source: 'open_food_facts',
          raw: item as Record<string, unknown>,
        }))
        .filter((item) => item.id && item.name),
    };
  }

  async getNutrition(input: GetNutritionInput): Promise<NutritionResult> {
    const productCode = input.id?.trim();
    if (!productCode) {
      throw new Error('Open Food Facts 获取营养数据时必须提供条码 id');
    }

    const response = await this.httpClient.getJson<OpenFoodFactsProductResponse>({
      url: `${this.baseUrl()}/api/v2/product/${encodeURIComponent(productCode)}?fields=${encodeURIComponent(OPEN_FOOD_FACTS_FIELDS)}`,
      timeoutMs: this.timeoutMs(),
      requestId: input.requestId,
    });
    const product = response.product;
    if (!product) {
      throw new Error(`Open Food Facts 未返回商品数据: ${productCode}`);
    }

    const nutriments = isRecord(product.nutriments) ? product.nutriments : {};
    const salt = toNumber(nutriments.salt_100g);
    return {
      name: String(product.product_name ?? productCode),
      calories: toNumber(nutriments['energy-kcal_100g']),
      protein: toNumber(nutriments.proteins_100g),
      fat: toNumber(nutriments.fat_100g),
      carbs: toNumber(nutriments.carbohydrates_100g),
      fiber: toNumber(nutriments.fiber_100g),
      sodium: toNumber(nutriments.sodium_100g) || round(salt * 0.393),
      source: 'open_food_facts',
      raw: product as Record<string, unknown>,
    };
  }

  private baseUrl(): string {
    return getEnvString('OPEN_FOOD_FACTS_BASE_URL', 'https://world.openfoodfacts.org')!;
  }

  private timeoutMs(): number {
    return getEnvNumber('OPEN_FOOD_FACTS_TIMEOUT_MS', 8000);
  }
}

type OpenFoodFactsSearchResponse = {
  products?: Array<Record<string, unknown>>;
};

type OpenFoodFactsProductResponse = {
  product?: Record<string, unknown>;
};

const OPEN_FOOD_FACTS_FIELDS = [
  'code',
  'product_name',
  'product_name_en',
  'product_name_zh',
  'product_name_zh_cn',
  'product_name_zh_hans',
  'generic_name',
  'generic_name_en',
  'generic_name_zh',
  'generic_name_zh_cn',
  'generic_name_zh_hans',
  'brands',
  'countries_tags',
  'nutriments',
].join(',');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
