import { Inject, Injectable } from '@nestjs/common';
import { getEnvNumber, getEnvString } from '@lumimax/config';
import { DietProviderHttpClient } from '../provider-http.client';
import type {
  FoodVisionProvider,
  FoodVisionResult,
  IdentifyFoodInput,
} from '../../interfaces/provider.contracts';
import { resolveVisionImage } from './vision-image';

@Injectable()
export class QwenVisionProvider implements FoodVisionProvider {
  constructor(
    @Inject(DietProviderHttpClient) private readonly httpClient: DietProviderHttpClient,
  ) {}

  async identifyFood(input: IdentifyFoodInput): Promise<FoodVisionResult> {
    const apiKey = getEnvString('LLM_VISION_AK', '')!;
    if (!apiKey) {
      throw new Error('Qwen 图片识别需要配置 LLM_VISION_AK');
    }

    const model = getEnvString('LLM_VISION_MODEL', 'qwen-vl-max-latest')!;
    validateQwenVisionModel(model);
    const baseUrl = resolveQwenVisionBaseUrl();
    const timeoutMs = getEnvNumber('LLM_VISION_TIMEOUT_MS', 15000);
    const image = await resolveVisionImage(this.httpClient, input, timeoutMs);

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
              'Identify visible foods and return JSON as {"items":[{"name":"","displayName":"","type":"ingredient","confidence":0.0,"count":1,"estimatedWeightGram":0,"children":[]}]}.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  input.prompt
                  ?? `Identify visible foods from this image. Return JSON only. locale=${input.locale ?? 'unknown'}; country=${input.countryCode ?? 'unknown'}.`,
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
    const parsed = parseObject(rawContent);
    return {
      items: Array.isArray(parsed.items)
        ? parsed.items
          .map((item) => normalizeVisionItem(item))
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
        : [],
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

function resolveQwenVisionBaseUrl(): string {
  const configured = getEnvString('LLM_VISION_BASE_URL', '')!.trim();
  if (configured) {
    return configured;
  }
  return 'https://dashscope.aliyuncs.com/compatible-mode/v1';
}

function validateQwenVisionModel(model: string): void {
  const normalized = model.trim().toLowerCase();
  if (!normalized) {
    throw new Error('Qwen 图片识别需要配置 LLM_VISION_MODEL');
  }
  if (normalized.includes('vl') || normalized.includes('vision') || normalized.includes('omni')) {
    return;
  }
  throw new Error(
    `当前 LLM_VISION_MODEL=${model} 不是视觉模型。Qwen 视觉链路请使用 VLM，例如 Qwen-VL / Qwen2-VL / Qwen3-VL / Qwen3-Omni 系列模型。`,
  );
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

function normalizeVisionItem(value: unknown): FoodVisionResult['items'][number] | null {
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
    confidence: numberValue(record.confidence),
    count: normalizeCount(record.count),
    estimatedWeightGram: numberValue(record.estimatedWeightGram),
    children: Array.isArray(record.children)
      ? record.children
        .map((child) => normalizeChildItem(child))
        .filter((child): child is NonNullable<typeof child> => Boolean(child))
      : undefined,
  };
}

function normalizeChildItem(
  value: unknown,
): NonNullable<FoodVisionResult['items'][number]['children']>[number] | null {
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
    confidence: numberValue(record.confidence),
    count: normalizeCount(record.count),
    estimatedWeightGram: numberValue(record.estimatedWeightGram),
  };
}

function normalizeFoodType(value: unknown): FoodVisionResult['items'][number]['type'] | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  switch (normalized) {
    case 'ingredient':
    case 'prepared_dish':
    case 'packaged_food':
    case 'restaurant_food':
    case 'mixed_meal':
    case 'unknown':
      return normalized;
    default:
      return undefined;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeCount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  return undefined;
}
