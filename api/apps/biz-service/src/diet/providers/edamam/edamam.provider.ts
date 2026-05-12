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
export class EdamamProvider implements NutritionDataProvider {
  constructor(
    @Inject(DietProviderHttpClient) private readonly httpClient: DietProviderHttpClient,
  ) {}

  async searchFood(input: SearchFoodInput): Promise<NutritionSearchResult> {
    const url = new URL(`${this.baseUrl()}/api/food-database/v2/parser`);
    url.searchParams.set('app_id', this.appId());
    url.searchParams.set('app_key', this.apiKey());
    url.searchParams.set('ingr', input.query);

    const response = await this.httpClient.getJson<EdamamParserResponse>({
      url: url.toString(),
      timeoutMs: this.timeoutMs(),
      requestId: input.requestId,
    });

    return {
      items: (response.hints ?? []).map((item, index) => ({
        id: String(item.food?.foodId ?? index),
        name: String(item.food?.label ?? '').trim(),
        brandName: undefined,
        source: 'edamam',
        raw: item as Record<string, unknown>,
      })).filter((item) => item.name),
    };
  }

  async getNutrition(input: GetNutritionInput): Promise<NutritionResult> {
    const query = input.query?.trim() || input.id?.trim();
    if (!query) {
      throw new Error('Edamam 获取营养数据时必须提供 query 或 id');
    }

    const normalizedQuery =
      input.weightGram && input.weightGram > 0
        ? `${input.weightGram} g ${query}`
        : query;
    const url = new URL(`${this.baseUrl()}/api/nutrition-data`);
    url.searchParams.set('app_id', this.appId());
    url.searchParams.set('app_key', this.apiKey());
    url.searchParams.set('nutrition-type', 'logging');
    url.searchParams.set('ingr', normalizedQuery);

    const response = await this.httpClient.getJson<EdamamNutritionResponse>({
      url: url.toString(),
      timeoutMs: this.timeoutMs(),
      requestId: input.requestId,
    });

    return {
      name: query,
      calories: toNumber(response.calories),
      protein: toNumber(response.totalNutrients?.PROCNT?.quantity),
      fat: toNumber(response.totalNutrients?.FAT?.quantity),
      carbs: toNumber(response.totalNutrients?.CHOCDF?.quantity),
      fiber: toNumber(response.totalNutrients?.FIBTG?.quantity),
      sodium: toNumber(response.totalNutrients?.NA?.quantity),
      source: 'edamam',
      raw: response as Record<string, unknown>,
    };
  }

  private appId(): string {
    const appId = getEnvString('EDAMAM_APP_ID', '')!;
    if (!appId) {
      throw new Error('必须配置 EDAMAM_APP_ID');
    }
    return appId;
  }

  private apiKey(): string {
    const apiKey = getEnvString('EDAMAM_API_KEY', '')!;
    if (!apiKey) {
      throw new Error('必须配置 EDAMAM_API_KEY');
    }
    return apiKey;
  }

  private baseUrl(): string {
    return getEnvString('EDAMAM_BASE_URL', 'https://api.edamam.com')!;
  }

  private timeoutMs(): number {
    return getEnvNumber('EDAMAM_TIMEOUT_MS', 8000);
  }
}

type EdamamParserResponse = {
  hints?: Array<Record<string, unknown> & {
    food?: {
      foodId?: string;
      label?: string;
    };
  }>;
};

type EdamamNutritionResponse = {
  calories?: number;
  totalNutrients?: Record<string, { quantity?: number }>;
};

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
