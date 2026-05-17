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
export class BooheeProvider implements NutritionDataProvider {
  constructor(
    @Inject(DietProviderHttpClient) private readonly httpClient: DietProviderHttpClient,
  ) {}

  async searchFood(input: SearchFoodInput): Promise<NutritionSearchResult> {
    const query = input.query?.trim();
    if (!query) {
      return { items: [] };
    }

    const response = await this.httpClient.getJson<BooheeSearchResponse>({
      url: this.buildSearchUrl(query),
      headers: this.buildHeaders(),
      timeoutMs: this.timeoutMs(),
      requestId: input.requestId,
    });

    return {
      items: this.extractSearchItems(response).map((item, index) => ({
        id: readString(item, ['id', 'food_id', 'code']) || `${index}`,
        name: readString(item, ['name', 'food_name', 'title']) || query,
        brandName: readString(item, ['brand_name', 'brand', 'restaurant']),
        source: 'boohee',
        raw: item,
      })).filter((item) => item.name.trim()),
    };
  }

  async getNutrition(input: GetNutritionInput): Promise<NutritionResult> {
    if (input.id?.trim()) {
      const response = await this.httpClient.getJson<Record<string, unknown>>({
        url: this.buildDetailUrl(input.id.trim()),
        headers: this.buildHeaders(),
        timeoutMs: this.timeoutMs(),
        requestId: input.requestId,
      });
      return this.mapNutrition(response, input.query?.trim() || input.id.trim());
    }

    const query = input.query?.trim();
    if (!query) {
      throw new Error('Boohee 获取营养数据时必须提供 query 或 id');
    }

    const search = await this.searchFood({ query, requestId: input.requestId });
    const first = search.items[0];
    if (!first?.id) {
      throw new Error(`Boohee 未找到食物: ${query}`);
    }
    return this.getNutrition({
      id: first.id,
      query: first.name || query,
      weightGram: input.weightGram,
      requestId: input.requestId,
    });
  }

  private mapNutrition(raw: Record<string, unknown>, fallbackName: string): NutritionResult {
    const container = unwrapRecord(raw, ['data', 'item', 'result']) ?? raw;
    const payload = unwrapRecord(container, ['food', 'item', 'detail']) ?? container;
    const nutrients = unwrapRecord(payload, ['nutrition', 'nutrients', 'per100g']) ?? payload;

    return {
      name: readString(payload, ['name', 'food_name', 'title']) || fallbackName,
      calories: readNumber(nutrients, ['calories', 'energy', 'energy_kcal', 'kcal']) ?? 0,
      protein: readNumber(nutrients, ['protein', 'protein_g']) ?? 0,
      fat: readNumber(nutrients, ['fat', 'fat_g', 'lipid']) ?? 0,
      carbs: readNumber(nutrients, ['carbs', 'carbohydrate', 'carbohydrates', 'carbs_g']) ?? 0,
      fiber: readNumber(nutrients, ['fiber', 'dietary_fiber', 'fiber_g']) ?? undefined,
      sodium: readNumber(nutrients, ['sodium', 'sodium_mg', 'na']) ?? undefined,
      source: 'boohee',
      raw,
    };
  }

  private buildSearchUrl(query: string): string {
    const url = new URL(this.searchPath(), this.baseUrl());
    url.searchParams.set('q', query);
    url.searchParams.set('query', query);
    this.applyCredentials(url);
    return url.toString();
  }

  private buildDetailUrl(id: string): string {
    const path = this.detailPath().replace('{id}', encodeURIComponent(id));
    const url = new URL(path, this.baseUrl());
    this.applyCredentials(url);
    return url.toString();
  }

  private applyCredentials(url: URL): void {
    if (this.appId()) {
      url.searchParams.set('app_id', this.appId());
    }
    if (this.appKey()) {
      url.searchParams.set('app_key', this.appKey());
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.appId()) {
      headers['x-app-id'] = this.appId();
    }
    if (this.appKey()) {
      headers['x-app-key'] = this.appKey();
    }
    return headers;
  }

  private extractSearchItems(response: BooheeSearchResponse): Array<Record<string, unknown>> {
    if (Array.isArray(response)) {
      return response.filter(isRecord);
    }
    const directItems = unwrapArray(response, ['items', 'list', 'data', 'foods', 'result']);
    if (directItems.length > 0) {
      return directItems;
    }
    const nested = unwrapRecord(response, ['data', 'result']);
    if (nested) {
      return unwrapArray(nested, ['items', 'list', 'foods']);
    }
    return [];
  }

  private baseUrl(): string {
    const baseUrl = getEnvString('BOOHEE_BASE_URL', '')!.trim();
    if (!baseUrl) {
      throw new Error('必须配置 BOOHEE_BASE_URL');
    }
    return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  }

  private searchPath(): string {
    return getEnvString('BOOHEE_SEARCH_PATH', '/api/v1/foods/search')!.trim() || '/api/v1/foods/search';
  }

  private detailPath(): string {
    return getEnvString('BOOHEE_DETAIL_PATH', '/api/v1/foods/{id}')!.trim() || '/api/v1/foods/{id}';
  }

  private appId(): string {
    return getEnvString('BOOHEE_APP_ID', '')!.trim();
  }

  private appKey(): string {
    return getEnvString('BOOHEE_APP_KEY', '')!.trim();
  }

  private timeoutMs(): number {
    return getEnvNumber('BOOHEE_TIMEOUT_MS', 8000);
  }
}

type BooheeSearchResponse = Record<string, unknown> | Array<Record<string, unknown>>;

function unwrapRecord(
  raw: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (isRecord(value)) {
      return value;
    }
  }
  return undefined;
}

function unwrapArray(
  raw: Record<string, unknown>,
  keys: string[],
): Array<Record<string, unknown>> {
  for (const key of keys) {
    const value = raw[key];
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }
  return [];
}

function readString(raw: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

function readNumber(raw: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
