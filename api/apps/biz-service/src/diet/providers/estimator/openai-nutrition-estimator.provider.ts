import { Inject, Injectable } from '@nestjs/common';
import { getEnvNumber, getEnvString } from '@lumimax/config';
import { DietProviderHttpClient } from '../provider-http.client';
import type {
  EstimateNutritionInput,
  NutritionEstimateResult,
  NutritionEstimatorProvider,
} from '../../interfaces/provider.contracts';

@Injectable()
export class OpenAiNutritionEstimatorProvider implements NutritionEstimatorProvider {
  constructor(
    @Inject(DietProviderHttpClient) private readonly httpClient: DietProviderHttpClient,
  ) {}

  async estimate(input: EstimateNutritionInput): Promise<NutritionEstimateResult> {
    const apiKey = getEnvString('LLM_NUTRITION_AK', '')!;
    if (!apiKey) {
      throw new Error('OpenAI 营养估算需要配置 LLM_NUTRITION_AK');
    }

    const baseUrl = resolveNutritionBaseUrl('openai');
    const model = getEnvString('LLM_NUTRITION_MODEL', 'gpt-4.1-mini')!;
    const timeoutMs = getEnvNumber('NUTRITION_ESTIMATOR_TIMEOUT_MS', 15000);

    const response = await this.httpClient.postJson<OpenAiChatCompletionResponse>({
      url: `${baseUrl}/chat/completions`,
      timeoutMs,
      requestId: input.requestId,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: {
        model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Estimate nutrition and return JSON as {"name":"","calories":0,"protein":0,"fat":0,"carbs":0,"fiber":0,"confidence":0.0}.',
          },
          {
            role: 'user',
            content: `food=${input.foodName}; weightGram=${input.weightGram ?? 100}; locale=${input.locale ?? 'unknown'}; country=${input.countryCode ?? 'unknown'}`,
          },
        ],
      },
    });

    const rawContent = response.choices?.[0]?.message?.content ?? '{}';
    const parsed = parseObject(rawContent);

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

function resolveNutritionBaseUrl(provider: 'openai' | 'gemini'): string {
  const configured = getEnvString('LLM_NUTRITION_BASE_URL', '')!.trim();
  if (configured) {
    return configured;
  }
  if (provider === 'gemini') {
    return 'https://generativelanguage.googleapis.com/v1beta';
  }
  return 'https://api.openai.com/v1';
}

type OpenAiChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
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
