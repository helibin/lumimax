import { Inject, Injectable } from '@nestjs/common';
import { getEnvNumber, getEnvString } from '@lumimax/config';
import { DietProviderHttpClient } from '../provider-http.client';
import type {
  EstimateNutritionInput,
  NutritionEstimateResult,
  NutritionEstimatorProvider,
} from '../../interfaces/provider.contracts';

@Injectable()
export class GeminiNutritionEstimatorProvider implements NutritionEstimatorProvider {
  constructor(
    @Inject(DietProviderHttpClient) private readonly httpClient: DietProviderHttpClient,
  ) {}

  async estimate(input: EstimateNutritionInput): Promise<NutritionEstimateResult> {
    const apiKey = getEnvString('LLM_NUTRITION_AK', '')!;
    if (!apiKey) {
      throw new Error('Gemini 营养估算需要配置 LLM_NUTRITION_AK');
    }

    const baseUrl = getEnvString(
      'LLM_NUTRITION_BASE_URL',
      '',
    )!;
    const resolvedBaseUrl = baseUrl.trim() || 'https://generativelanguage.googleapis.com/v1beta';
    const model = getEnvString('LLM_NUTRITION_MODEL', 'gemini-2.5-flash')!;
    const timeoutMs = getEnvNumber('NUTRITION_ESTIMATOR_TIMEOUT_MS', 15000);

    const response = await this.httpClient.postJson<GeminiGenerateContentResponse>({
      url: `${resolvedBaseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      timeoutMs,
      requestId: input.requestId,
      body: {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text:
                  'Estimate nutrition and return JSON as '
                  + '{"name":"","calories":0,"protein":0,"fat":0,"carbs":0,"fiber":0,"confidence":0.0}. '
                  + `food=${input.foodName}; weightGram=${input.weightGram ?? 100}; `
                  + `locale=${input.locale ?? 'unknown'}; country=${input.countryCode ?? 'unknown'}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      },
    });

    const text = response.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === 'string')
      ?.text ?? '{}';
    const parsed = parseObject(text);

    return {
      name: stringValue(parsed.name) ?? input.foodName,
      calories: numberValue(parsed.calories),
      protein: numberValue(parsed.protein),
      fat: numberValue(parsed.fat),
      carbs: numberValue(parsed.carbs),
      fiber: numberValue(parsed.fiber),
      confidence: numberValue(parsed.confidence),
      source: 'llm_estimator',
      raw: parsed,
    };
  }
}

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
