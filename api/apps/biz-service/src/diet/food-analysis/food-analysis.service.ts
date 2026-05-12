import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '@lumimax/logger';
import type { RecognitionCandidate } from '../interfaces/diet-center.contracts';
import { FoodIdentityService } from '../food/food-identity.service';
import { isExternalServiceError, isExternalServiceTimeoutError } from '../providers/provider-error';
import { VisionProviderFactory } from '../providers/vision/vision-provider.factory';

@Injectable()
export class FoodAnalysisService {
  constructor(
    @Inject(AppLogger) private readonly logger: AppLogger,
    @Inject(VisionProviderFactory)
    private readonly visionProviderFactory: VisionProviderFactory,
    @Inject(FoodIdentityService) private readonly foodIdentityService: FoodIdentityService,
  ) {}

  async identifyFood(input: {
    imageKey: string;
    imageUrl?: string;
    locale?: string;
    countryCode?: string;
    requestId: string;
  }): Promise<{
    foodName: string;
    canonicalName: string;
    provider: string;
    source: string;
    recognitionStatus: 'success' | 'fallback';
    confidence?: number;
    candidates: RecognitionCandidate[];
    raw?: Record<string, unknown>;
  }> {
    const providerEntry = this.visionProviderFactory.resolveActive();
    const imageUrl = normalizeImageUrl(input.imageUrl);
    const imageUrlHost = pickUrlHost(imageUrl);
    this.logger.log(
      `图片识别开始 requestId=${input.requestId} provider=${providerEntry.name} imageKey=${input.imageKey} 已生成临时访问链接=${Boolean(imageUrl)} imageUrlHost=${imageUrlHost ?? 'unknown'} locale=${input.locale ?? 'unknown'} country=${input.countryCode ?? 'unknown'}`,
    );

    if (imageUrl) {
      try {
        const result = await providerEntry.provider.identifyFood({
          imageUrl,
          locale: input.locale,
          countryCode: input.countryCode,
          requestId: input.requestId,
        });
        const candidates = result.items
          .map((item) => this.toCandidate(item, providerEntry.name, input))
          .filter((item): item is RecognitionCandidate => Boolean(item))
          .slice(0, 5);
        const first = candidates[0];
        if (first?.name) {
          this.logger.log(
            `图片识别成功 requestId=${input.requestId} provider=${providerEntry.name} topFood=${first.name} confidence=${first.confidence ?? 'n/a'} candidateCount=${candidates.length}`,
          );
          return {
            foodName: first.name,
            canonicalName: first.canonicalName,
            provider: providerEntry.name,
            source: 'vision-provider',
            recognitionStatus: 'success',
            confidence: first.confidence,
            candidates,
            raw: result.raw,
          };
        }
        this.logger.warn(
          `图片识别结果为空 requestId=${input.requestId} provider=${providerEntry.name} candidateCount=${candidates.length}`,
        );
      } catch (error) {
        if (isExternalServiceTimeoutError(error) || isTimeoutLikeError(error)) {
          this.logger.error(
            `图片识别超时 requestId=${input.requestId} provider=${providerEntry.name} imageKey=${input.imageKey} imageUrlHost=${imageUrlHost ?? 'unknown'} 原因=${error instanceof Error ? error.message : String(error)}`,
          );
          throw new Error('图片识别超时');
        }
        if (isExternalServiceError(error)) {
          this.logger.error(
            `图片识别调用失败 requestId=${input.requestId} provider=${providerEntry.name} imageKey=${input.imageKey} imageUrlHost=${imageUrlHost ?? 'unknown'} kind=${error.kind} statusCode=${error.statusCode ?? 'n/a'} 原因=${error.message}`,
          );
          throw new Error(resolveVisionServiceFailureMessage(error));
        }
        this.logger.warn(
          `图片识别失败 requestId=${input.requestId} provider=${providerEntry.name} imageKey=${input.imageKey} imageUrlHost=${imageUrlHost ?? 'unknown'} 原因=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else {
      this.logger.warn(
        `图片识别跳过远程识别 requestId=${input.requestId} provider=${providerEntry.name} imageKey=${input.imageKey} 原因=未生成可访问的临时图片链接`,
      );
    }

    const fallbackName = inferFoodNameFromImageKey(input.imageKey);
    const fallbackCandidate = this.buildFallbackCandidate(fallbackName);
    this.logger.warn(
      `图片识别回退 requestId=${input.requestId} provider=vision-fallback inferredFood=${fallbackName} imageKey=${input.imageKey}`,
    );
    return {
      foodName: fallbackName,
      canonicalName: fallbackCandidate.canonicalName,
      provider: 'vision-fallback',
      source: 'image-key-fallback',
      recognitionStatus: 'fallback',
      confidence: fallbackCandidate.confidence,
      candidates: [fallbackCandidate],
      raw: {
        imageKey: input.imageKey,
      },
    };
  }

  private toCandidate(
    item: {
      type?: 'ingredient' | 'prepared_dish' | 'packaged_food' | 'restaurant_food' | 'mixed_meal' | 'unknown';
      name: string;
      displayName?: string;
      confidence?: number;
      count?: number;
      estimatedWeightGram?: number;
      children?: Array<{
        type?: 'ingredient' | 'prepared_dish' | 'packaged_food' | 'restaurant_food' | 'mixed_meal' | 'unknown';
        name: string;
        displayName?: string;
        confidence?: number;
        count?: number;
        estimatedWeightGram?: number;
      }>;
    },
    provider: string,
    input: { locale?: string; countryCode?: string },
  ): RecognitionCandidate | null {
    const name = item.name?.trim();
    if (!name) {
      return null;
    }
    const identity = this.foodIdentityService.buildIdentity({
      name,
      locale: input.locale,
      countryCode: input.countryCode,
      sourceType: 'vision',
    });
    return {
      type: item.type ?? inferRecognitionType(name, item.children),
      name,
      displayName: item.displayName?.trim() || name,
      canonicalName: identity.canonicalName,
      normalizedName: identity.normalizedName,
      confidence: round(item.confidence ?? 0.65),
      provider,
      source: 'vision-provider',
      count: normalizeCount(item.count),
      estimatedWeightGram: normalizeWeight(item.estimatedWeightGram),
      children: (item.children ?? [])
        .map((child) => this.toCandidate(child, provider, input))
        .filter((child): child is RecognitionCandidate => Boolean(child)),
    };
  }

  private buildFallbackCandidate(name: string): RecognitionCandidate {
    const identity = this.foodIdentityService.buildIdentity({
      name,
      sourceType: 'vision',
    });
    return {
      type: inferRecognitionType(name),
      name,
      displayName: name,
      canonicalName: identity.canonicalName,
      normalizedName: identity.normalizedName,
      confidence: 0.3,
      provider: 'vision-fallback',
      source: 'image-key-fallback',
    };
  }
}

function normalizeImageUrl(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (trimmed.startsWith('data:image/')) {
    return trimmed;
  }
  return undefined;
}

function pickUrlHost(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return new URL(value).host || undefined;
  } catch {
    return undefined;
  }
}

function inferFoodNameFromImageKey(imageKey: string): string {
  const lowered = imageKey.toLowerCase();
  for (const candidate of ['apple', 'chicken', 'rice', 'salad', 'banana', 'beef', 'egg']) {
    if (lowered.includes(candidate)) {
      return candidate;
    }
  }
  const basename = lowered.split('/').pop() ?? lowered;
  const normalized = basename
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  return normalized || 'unknown food';
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeCount(value: number | undefined): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return value && value > 0 ? Math.round(value) : undefined;
}

function normalizeWeight(value: number | undefined): number | undefined {
  if (!Number.isFinite(value) || Number(value) <= 0) {
    return undefined;
  }
  return round(Number(value));
}

function inferRecognitionType(
  name: string,
  children?: Array<{ name: string }>,
): 'ingredient' | 'prepared_dish' | 'mixed_meal' {
  if (Array.isArray(children) && children.length > 1) {
    return 'mixed_meal';
  }
  const normalized = name.trim().toLowerCase();
  const dishKeywords = ['rice bowl', 'salad', 'sandwich', 'burger', 'soup', 'noodle', 'pasta', '炒', '饭', '面', '沙拉', '汤'];
  return dishKeywords.some((keyword) => normalized.includes(keyword)) ? 'prepared_dish' : 'ingredient';
}

function isTimeoutLikeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes('connect timeout')
    || lower.includes('und_err_connect_timeout')
    || lower.includes('请求超时')
    || lower.includes('etimedout')
    || lower.includes('esockettimedout')
    || lower.includes('deadline exceeded')
  );
}

function resolveVisionServiceFailureMessage(error: {
  kind: string;
  userMessage?: string;
}): string {
  switch (error.kind) {
    case 'rate_limit':
      return '图片识别服务限流';
    case 'unauthorized':
      return '图片识别服务鉴权失败';
    case 'not_found':
      return '图片识别图片不存在';
    case 'network':
    case 'unavailable':
      return '图片识别服务暂不可用';
    case 'bad_response':
      return error.userMessage ?? '图片识别服务返回异常';
    default:
      return error.userMessage ?? '图片识别服务调用失败';
  }
}
