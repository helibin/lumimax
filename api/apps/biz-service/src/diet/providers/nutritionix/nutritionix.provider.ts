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
export class NutritionixProvider implements NutritionDataProvider {
  constructor(
    @Inject(DietProviderHttpClient) private readonly httpClient: DietProviderHttpClient,
  ) {}

  async searchFood(input: SearchFoodInput): Promise<NutritionSearchResult> {
    const response = await this.httpClient.getJson<NutritionixSearchResponse>({
      url: `${this.baseUrl()}/v2/search/instant?query=${encodeURIComponent(input.query)}`,
      timeoutMs: this.timeoutMs(),
      headers: this.headers(),
      requestId: input.requestId,
    });

    const common = Array.isArray(response.common) ? response.common : [];
    const branded = Array.isArray(response.branded) ? response.branded : [];

    return {
      items: [...common, ...branded].map((item, index) => ({
        id: String(item.food_name ?? item.nix_item_id ?? index),
        name: String(item.food_name ?? '').trim(),
        brandName: typeof item.brand_name === 'string' ? item.brand_name : undefined,
        source: 'nutritionix',
        raw: item as Record<string, unknown>,
      })),
    };
  }

  async getNutrition(input: GetNutritionInput): Promise<NutritionResult> {
    const query = input.query?.trim() || input.id?.trim();
    if (!query) {
      throw new Error('Nutritionix 获取营养数据时必须提供 query 或 id');
    }

    const response = await this.httpClient.postJson<NutritionixNaturalNutrientsResponse>({
      url: `${this.baseUrl()}/v2/natural/nutrients`,
      timeoutMs: this.timeoutMs(),
      headers: this.headers(),
      requestId: input.requestId,
      body: {
        query:
          input.weightGram && input.weightGram > 0
            ? `${input.weightGram}g ${query}`
            : query,
      },
    });

    const first = response.foods?.[0];
    if (!first) {
      throw new Error(`Nutritionix 未返回食物数据: ${query}`);
    }

    return {
      name: String(first.food_name ?? query),
      calories: toNumber(first.nf_calories),
      protein: toNumber(first.nf_protein),
      fat: toNumber(first.nf_total_fat),
      carbs: toNumber(first.nf_total_carbohydrate),
      fiber: toNumber(first.nf_dietary_fiber),
      sodium: toNumber(first.nf_sodium),
      source: 'nutritionix',
      raw: first as Record<string, unknown>,
    };
  }

  private baseUrl(): string {
    return getEnvString('NUTRITIONIX_BASE_URL', 'https://trackapi.nutritionix.com')!;
  }

  private timeoutMs(): number {
    return getEnvNumber('NUTRITIONIX_TIMEOUT_MS', 8000);
  }

  private headers(): Record<string, string> {
    const appId = getEnvString('NUTRITIONIX_APP_ID', '')!;
    const apiKey = getEnvString('NUTRITIONIX_API_KEY', '')!;
    if (!appId || !apiKey) {
      throw new Error('必须同时配置 NUTRITIONIX_APP_ID 和 NUTRITIONIX_API_KEY');
    }
    return {
      'x-app-id': appId,
      'x-app-key': apiKey,
    };
  }
}

type NutritionixSearchResponse = {
  common?: Array<Record<string, unknown>>;
  branded?: Array<Record<string, unknown>>;
};

type NutritionixNaturalNutrientsResponse = {
  foods?: Array<Record<string, unknown>>;
};

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
