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
            content:
              'Identify visible foods and return JSON as {"items":[{"name":"","confidence":0.0,"count":1}]}.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  input.prompt
                  ?? `Locale=${input.locale ?? 'unknown'}, country=${input.countryCode ?? 'unknown'}.`,
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

function normalizeVisionItem(
  value: unknown,
): { name: string; confidence?: number; count?: number } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name) {
    return null;
  }
  return {
    name,
    confidence: typeof record.confidence === 'number' ? record.confidence : undefined,
    count: normalizeCount(record.count),
  };
}

function normalizeCount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  return undefined;
}
