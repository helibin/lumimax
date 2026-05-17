import { Inject, Injectable } from '@nestjs/common';
import { getEnvNumber, getEnvString } from '@lumimax/config';
import { DietProviderHttpClient } from '../provider-http.client';
import type {
  EstimateNutritionInput,
  NutritionEstimateResult,
  NutritionEstimatorProvider,
} from '../../interfaces/provider.contracts';
import {
  buildNutritionEstimatorUserPrompt,
  NUTRITION_ESTIMATOR_SYSTEM_PROMPT,
  parseLlmJsonObject,
  readLlmNumber,
  readLlmString,
} from './nutrition-estimator-llm-prompt.util';

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
            content: NUTRITION_ESTIMATOR_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: buildNutritionEstimatorUserPrompt(input),
          },
        ],
      },
    });

    const rawContent = response.choices?.[0]?.message?.content ?? '{}';
    const parsed = parseLlmJsonObject(rawContent);

    return {
      name: readLlmString(parsed.name) ?? input.foodName,
      calories: readLlmNumber(parsed.calories),
      protein: readLlmNumber(parsed.protein),
      fat: readLlmNumber(parsed.fat),
      carbs: readLlmNumber(parsed.carbs),
      fiber: readLlmNumber(parsed.fiber),
      confidence: readLlmNumber(parsed.confidence),
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
