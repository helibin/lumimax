import { Inject, Injectable } from '@nestjs/common';
import { getEnvNumber, getEnvString } from '@lumimax/config';
import { DietProviderHttpClient } from '../provider-http.client';
import type {
  EstimateNutritionInput,
  NutritionEstimateResult,
  NutritionEstimatorProvider,
} from '../../interfaces/provider.contracts';

@Injectable()
export class QwenNutritionEstimatorProvider implements NutritionEstimatorProvider {
  constructor(
    @Inject(DietProviderHttpClient) private readonly httpClient: DietProviderHttpClient,
  ) {}

  async estimate(input: EstimateNutritionInput): Promise<NutritionEstimateResult> {
    const apiKey = getEnvString('LLM_NUTRITION_AK', '')!;
    if (!apiKey) {
      throw new Error('Qwen 营养估算需要配置 LLM_NUTRITION_AK');
    }

    const baseUrl = resolveNutritionBaseUrl();
    const model = getEnvString('LLM_NUTRITION_MODEL', 'qwen-plus-latest')!;
    const timeoutMs = getEnvNumber('NUTRITION_ESTIMATOR_TIMEOUT_MS', 15000);

    const response = await this.httpClient.postJson<QwenChatCompletionResponse>({
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

type QwenChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function resolveNutritionBaseUrl(): string {
  const configured = getEnvString('LLM_NUTRITION_BASE_URL', '')!.trim();
  if (configured) {
    return configured;
  }
  return 'https://dashscope.aliyuncs.com/compatible-mode/v1';
}

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
