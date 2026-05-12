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
export class UsdaFdcProvider implements NutritionDataProvider {
  constructor(
    @Inject(DietProviderHttpClient) private readonly httpClient: DietProviderHttpClient,
  ) {}

  async searchFood(input: SearchFoodInput): Promise<NutritionSearchResult> {
    const response = await this.httpClient.getJson<UsdaSearchResponse>({
      url: `${this.baseUrl()}/foods/search?api_key=${encodeURIComponent(this.apiKey())}&query=${encodeURIComponent(input.query)}`,
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
    if (input.id?.trim()) {
      const response = await this.httpClient.getJson<Record<string, unknown>>({
        url: `${this.baseUrl()}/food/${encodeURIComponent(input.id.trim())}?api_key=${encodeURIComponent(this.apiKey())}`,
        timeoutMs: this.timeoutMs(),
        requestId: input.requestId,
      });
      return this.mapNutrition(response, String(response.description ?? input.id));
    }

    if (!input.query?.trim()) {
      throw new Error('USDA FDC getNutrition requires id or query');
    }

    const search = await this.searchFood({ query: input.query, requestId: input.requestId });
    const first = search.items[0];
    if (!first?.id) {
      throw new Error(`USDA FDC returned no food for ${input.query}`);
    }

    return this.getNutrition({ id: first.id, weightGram: input.weightGram, requestId: input.requestId });
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
