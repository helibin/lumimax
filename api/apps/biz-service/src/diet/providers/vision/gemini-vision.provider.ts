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
export class GeminiVisionProvider implements FoodVisionProvider {
  constructor(
    @Inject(DietProviderHttpClient) private readonly httpClient: DietProviderHttpClient,
  ) {}

  async identifyFood(input: IdentifyFoodInput): Promise<FoodVisionResult> {
    const apiKey = getEnvString('LLM_VISION_AK', '')!;
    if (!apiKey) {
      throw new Error('Gemini 图片识别需要配置 LLM_VISION_AK');
    }

    const baseUrl = getEnvString(
      'LLM_VISION_BASE_URL',
      '',
    )!;
    const resolvedBaseUrl = baseUrl.trim() || 'https://generativelanguage.googleapis.com/v1beta';
    const model = getEnvString('LLM_VISION_MODEL', 'gemini-2.5-flash')!;
    const timeoutMs = getEnvNumber('LLM_VISION_TIMEOUT_MS', 15000);
    const image = await resolveVisionImage(this.httpClient, input, timeoutMs);

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
                  input.prompt
                  ?? `Identify visible foods and return JSON as {"items":[{"name":"","confidence":0.0,"count":1}]}. Locale=${input.locale ?? 'unknown'}, country=${input.countryCode ?? 'unknown'}.`,
              },
              {
                inline_data: {
                  mime_type: image.contentType,
                  data: image.base64,
                },
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
      items: Array.isArray(parsed.items)
        ? parsed.items
          .map((item) => normalizeVisionItem(item))
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
        : [],
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
