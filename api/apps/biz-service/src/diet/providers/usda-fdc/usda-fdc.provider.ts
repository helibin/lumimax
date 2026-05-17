import { Inject, Injectable } from '@nestjs/common';
import { getEnvNumber, getEnvString } from '@lumimax/config';
import { DietProviderHttpClient } from '../provider-http.client';
import { resolveProviderSearchQuery } from '../../food-query/provider-search-query.util';
import type {
  GetNutritionInput,
  NutritionDataProvider,
  NutritionResult,
  NutritionSearchResult,
  SearchFoodInput,
} from '../../interfaces/provider.contracts';

const SEARCH_PAGE_SIZE = 25;
/** 复用 searchHits 或二次 search 时最多尝试的候选数 */
const MAX_RESOLVE_CANDIDATES = 5;
/** 详情 404 后最多额外拉取的详情数（不含已尝试的 preferred id） */
const MAX_EXTRA_DETAIL_LOOKUPS = 2;

@Injectable()
export class UsdaFdcProvider implements NutritionDataProvider {
  constructor(
    @Inject(DietProviderHttpClient) private readonly httpClient: DietProviderHttpClient,
  ) {}

  async searchFood(input: SearchFoodInput): Promise<NutritionSearchResult> {
    const searchQuery = resolveProviderSearchQuery({
      query: input.query,
      alternateQueries: input.alternateQueries,
      role: 'primary',
      market: input.market,
      countryCode: input.countryCode,
      locale: input.locale,
    });
    const response = await this.httpClient.getJson<UsdaSearchResponse>({
      url: this.buildSearchUrl(searchQuery),
      timeoutMs: this.timeoutMs(),
      requestId: input.requestId,
    });

    return {
      items: (response.foods ?? []).map((item) => ({
        id: String(item.fdcId ?? ''),
        name: String(item.description ?? '').trim(),
        brandName: typeof item.brandOwner === 'string' ? item.brandOwner : undefined,
        source: 'usda_fdc',
        raw: item as Record<string, unknown>,
      })),
    };
  }

  async getNutrition(input: GetNutritionInput): Promise<NutritionResult> {
    const id = input.id?.trim();
    const query = input.query?.trim();
    const searchHits = normalizeSearchHits(input.searchHits, input.raw);

    if (input.raw && hasUsableNutrients(input.raw)) {
      return this.mapNutrition(
        input.raw,
        String(input.raw.description ?? query ?? id ?? ''),
      );
    }

    if (id) {
      const attemptedDetailIds = new Set<string>([id]);
      const detail = await this.fetchFoodDetail(id, input.requestId);
      if (detail && hasUsableNutrients(detail)) {
        return this.mapNutrition(detail, String(detail.description ?? query ?? id));
      }

      if (searchHits.length > 0 || query) {
        return this.resolveFromSearchCandidates({
          query: query ?? String(detail?.description ?? id),
          preferredId: id,
          attemptedDetailIds,
          foods: searchHits,
          requestId: input.requestId,
          market: input.market,
          countryCode: input.countryCode,
          locale: input.locale,
          alternateQueries: input.alternateQueries,
        });
      }

      if (detail) {
        return this.mapNutrition(detail, String(detail.description ?? id));
      }
      throw new Error(`USDA FDC food ${id} not found`);
    }

    if (!query) {
      throw new Error('USDA FDC getNutrition requires id or query');
    }

    return this.resolveFromSearchCandidates({
      query,
      foods: searchHits,
      requestId: input.requestId,
      market: input.market,
      countryCode: input.countryCode,
      locale: input.locale,
      alternateQueries: input.alternateQueries,
    });
  }

  private async resolveFromSearchCandidates(input: {
    query: string;
    preferredId?: string;
    attemptedDetailIds?: Set<string>;
    foods?: Array<Record<string, unknown>>;
    requestId?: string;
    market?: string;
    countryCode?: string;
    locale?: string;
    alternateQueries?: string[];
  }): Promise<NutritionResult> {
    const attemptedDetailIds = input.attemptedDetailIds ?? new Set<string>();
    let foods = input.foods ?? [];

    if (foods.length === 0) {
      const fallbackQuery = resolveProviderSearchQuery({
        query: input.query,
        alternateQueries: input.alternateQueries,
        role: 'fallback',
        market: input.market,
        countryCode: input.countryCode,
        locale: input.locale,
      });
      const response = await this.httpClient.getJson<UsdaSearchResponse>({
        url: this.buildSearchUrl(fallbackQuery),
        timeoutMs: this.timeoutMs(),
        requestId: input.requestId,
      });
      foods = Array.isArray(response.foods) ? response.foods : [];
    }

    const ordered = orderSearchFoods(foods, input.preferredId).slice(0, MAX_RESOLVE_CANDIDATES);
    let extraDetailLookups = 0;

    for (const food of ordered) {
      const fdcId = String(food.fdcId ?? '').trim();
      const label = String(food.description ?? input.query).trim() || input.query;

      if (hasUsableNutrients(food)) {
        return this.mapNutrition(food, label);
      }

      if (!fdcId || attemptedDetailIds.has(fdcId)) {
        continue;
      }
      if (extraDetailLookups >= MAX_EXTRA_DETAIL_LOOKUPS) {
        break;
      }

      attemptedDetailIds.add(fdcId);
      extraDetailLookups += 1;
      const detail = await this.fetchFoodDetail(fdcId, input.requestId);
      if (detail && hasUsableNutrients(detail)) {
        return this.mapNutrition(detail, String(detail.description ?? label));
      }
    }

    throw new Error(`USDA FDC returned no usable nutrition for ${input.query}`);
  }

  private async fetchFoodDetail(
    id: string,
    requestId?: string,
  ): Promise<Record<string, unknown> | null> {
    return this.httpClient.tryGetJson<Record<string, unknown>>({
      url: `${this.baseUrl()}/food/${encodeURIComponent(id)}?api_key=${encodeURIComponent(this.apiKey())}`,
      timeoutMs: this.timeoutMs(),
      requestId,
    });
  }

  private buildSearchUrl(query: string): string {
    const params = new URLSearchParams({
      api_key: this.apiKey(),
      query,
      pageSize: String(SEARCH_PAGE_SIZE),
      dataType: 'Branded,Foundation,SR Legacy,Survey (FNDDS)',
    });
    return `${this.baseUrl()}/foods/search?${params.toString()}`;
  }

  private mapNutrition(raw: Record<string, unknown>, fallbackName: string): NutritionResult {
    const nutrients = Array.isArray(raw.foodNutrients) ? raw.foodNutrients : [];
    return {
      name: String(raw.description ?? fallbackName),
      calories: findNutrient(nutrients, ['Energy']) ?? 0,
      protein: findNutrient(nutrients, ['Protein']) ?? 0,
      fat: findNutrient(nutrients, ['Total lipid (fat)', 'Total Fat']) ?? 0,
      carbs: findNutrient(nutrients, ['Carbohydrate, by difference', 'Carbohydrate']) ?? 0,
      fiber: findNutrient(nutrients, ['Fiber, total dietary', 'Dietary fiber']) ?? 0,
      sodium: findNutrient(nutrients, ['Sodium, Na', 'Sodium']) ?? 0,
      source: 'usda_fdc',
      raw,
    };
  }

  private apiKey(): string {
    const apiKey = getEnvString('USDA_FDC_API_KEY', '')!;
    if (!apiKey) {
      throw new Error('USDA_FDC_API_KEY is required');
    }
    return apiKey;
  }

  private baseUrl(): string {
    return getEnvString('USDA_FDC_BASE_URL', 'https://api.nal.usda.gov/fdc/v1')!;
  }

  private timeoutMs(): number {
    return getEnvNumber('USDA_FDC_TIMEOUT_MS', 8000);
  }
}

type UsdaSearchResponse = {
  foods?: Array<Record<string, unknown>>;
};

function normalizeSearchHits(
  searchHits: Array<Record<string, unknown>> | undefined,
  raw?: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const merged = raw ? [raw, ...(searchHits ?? [])] : [...(searchHits ?? [])];
  const seen = new Set<string>();
  const output: Array<Record<string, unknown>> = [];

  for (const food of merged) {
    const id = String(food.fdcId ?? '').trim();
    if (id) {
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
    }
    output.push(food);
  }

  return output;
}

function orderSearchFoods(
  foods: Array<Record<string, unknown>>,
  preferredId?: string,
): Array<Record<string, unknown>> {
  const preferred = preferredId?.trim();
  if (!preferred) {
    return foods;
  }

  const preferredItems: Array<Record<string, unknown>> = [];
  const rest: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  for (const food of foods) {
    const id = String(food.fdcId ?? '').trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    if (id === preferred) {
      preferredItems.push(food);
    } else {
      rest.push(food);
    }
  }

  return [...preferredItems, ...rest];
}

function hasUsableNutrients(raw: Record<string, unknown>): boolean {
  const nutrients = Array.isArray(raw.foodNutrients) ? raw.foodNutrients : [];
  return (
    findNutrient(nutrients, ['Energy']) !== undefined
    || findNutrient(nutrients, ['Protein']) !== undefined
    || findNutrient(nutrients, ['Carbohydrate, by difference', 'Carbohydrate']) !== undefined
    || findNutrient(nutrients, ['Total lipid (fat)', 'Total Fat']) !== undefined
  );
}

function findNutrient(
  nutrients: unknown[],
  names: string[],
): number | undefined {
  for (const nutrient of nutrients) {
    if (!nutrient || typeof nutrient !== 'object' || Array.isArray(nutrient)) {
      continue;
    }
    const record = nutrient as Record<string, unknown>;
    const name =
      typeof record.nutrientName === 'string'
        ? record.nutrientName
        : typeof record.name === 'string'
          ? record.name
          : '';
    if (names.includes(name)) {
      const amount = record.value ?? record.amount;
      return typeof amount === 'number' && Number.isFinite(amount) ? amount : undefined;
    }
  }
  return undefined;
}
