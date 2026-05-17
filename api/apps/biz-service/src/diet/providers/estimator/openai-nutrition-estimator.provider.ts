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
