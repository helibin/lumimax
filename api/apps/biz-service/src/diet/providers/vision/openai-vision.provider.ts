import { Inject, Injectable } from '@nestjs/common';
import { getEnvNumber, getEnvString } from '@lumimax/config';
import { DietProviderHttpClient } from '../provider-http.client';
import type {
  FoodVisionProvider,
  FoodVisionResult,
  IdentifyFoodInput,
} from '../../interfaces/provider.contracts';
import {
  normalizeNutritionLabelVisionResult,
  NUTRITION_LABEL_VISION_PROMPT,
  parseJsonObject,
} from './nutrition-label-vision.util';
import { resolveVisionImage } from './vision-image';
import {
  buildVisionIdentifyUserPrompt,
  VISION_IDENTIFY_SYSTEM_PROMPT,
} from './vision-llm-prompt.util';

@Injectable()
export class OpenAiVisionProvider implements FoodVisionProvider {
  constructor(
    @Inject(DietProviderHttpClient) private readonly httpClient: DietProviderHttpClient,
  ) {}

  async identifyFood(input: IdentifyFoodInput): Promise<FoodVisionResult> {
    const apiKey = getEnvString('LLM_VISION_AK', '')!;
    if (!apiKey) {
      throw new Error('OpenAI 图片识别需要配置 LLM_VISION_AK');
    }

    const model = getEnvString('LLM_VISION_MODEL', 'gpt-4.1-mini')!;
    const baseUrl = resolveVisionBaseUrl('openai');
    const timeoutMs = getEnvNumber('LLM_VISION_TIMEOUT_MS', 15000);
    const image = await resolveVisionImage(this.httpClient, input, timeoutMs);

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
            content: VISION_IDENTIFY_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: buildVisionIdentifyUserPrompt(input),
              },
              {
                type: 'image_url',
                image_url: {
                  url: image.dataUrl,
                },
              },
            ],
          },
        ],
      },
    });

    const rawContent = response.choices?.[0]?.message?.content ?? '{}';
    const parsed = parseJsonObject(rawContent);
    return {
      imageType: normalizeImageType(parsed.imageType),
      items: Array.isArray(parsed.items)
        ? parsed.items
          .map((item) => normalizeVisionItem(item))
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
        : [],
      raw: parsed,
    };
  }

  async parseNutritionLabel(input: IdentifyFoodInput) {
    const apiKey = getEnvString('LLM_VISION_AK', '')!;
    if (!apiKey) {
      throw new Error('OpenAI 营养成分表识别需要配置 LLM_VISION_AK');
    }

    const model = getEnvString('LLM_VISION_MODEL', 'gpt-4.1-mini')!;
    const baseUrl = resolveVisionBaseUrl('openai');
    const timeoutMs = getEnvNumber('LLM_VISION_TIMEOUT_MS', 15000);
    const image = await resolveVisionImage(this.httpClient, input, timeoutMs);

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
            content: NUTRITION_LABEL_VISION_PROMPT,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  input.prompt
                  ?? `locale=${input.locale ?? 'unknown'}; country=${input.countryCode ?? 'unknown'}`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: image.dataUrl,
                },
              },
            ],
          },
        ],
      },
    });

    const rawContent = response.choices?.[0]?.message?.content ?? '{}';
    return normalizeNutritionLabelVisionResult(parseJsonObject(rawContent));
  }
}

function resolveVisionBaseUrl(provider: 'openai' | 'gemini'): string {
  const configured = getEnvString('LLM_VISION_BASE_URL', '')!.trim();
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

function normalizeVisionItem(
  value: unknown,
): {
  type?: 'ingredient' | 'prepared_dish' | 'packaged_food' | 'restaurant_food' | 'mixed_meal' | 'unknown';
  name: string;
  displayName?: string;
  confidence?: number;
  count?: number;
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name) {
    return null;
  }
  return {
    type: normalizeFoodType(record.type),
    name,
    displayName: stringValue(record.displayName),
    confidence: typeof record.confidence === 'number' ? record.confidence : undefined,
    count: normalizeCount(record.count),
  };
}

function normalizeImageType(
  value: unknown,
):
  | 'food_photo'
  | 'packaged_food_front'
  | 'nutrition_label'
  | 'barcode_or_qr'
  | 'menu_or_receipt'
  | 'mixed'
  | 'unknown'
  | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  switch (value.trim()) {
    case 'food_photo':
    case 'packaged_food_front':
    case 'nutrition_label':
    case 'barcode_or_qr':
    case 'menu_or_receipt':
    case 'mixed':
    case 'unknown':
      return value.trim() as never;
    default:
      return undefined;
  }
}

function normalizeFoodType(
  value: unknown,
): 'ingredient' | 'prepared_dish' | 'packaged_food' | 'restaurant_food' | 'mixed_meal' | 'unknown' | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  switch (value.trim()) {
    case 'ingredient':
    case 'prepared_dish':
    case 'packaged_food':
    case 'restaurant_food':
    case 'mixed_meal':
    case 'unknown':
      return value.trim() as never;
    default:
      return undefined;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeCount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  return undefined;
}
