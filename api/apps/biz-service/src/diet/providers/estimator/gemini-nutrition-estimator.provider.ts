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
                text: NUTRITION_ESTIMATOR_SYSTEM_PROMPT,
              },
              {
                text: buildNutritionEstimatorUserPrompt(input),
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
    const parsed = parseLlmJsonObject(text);

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

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};
