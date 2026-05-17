import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { generateId } from '@lumimax/runtime';
import { resolveConfiguredIotVendor } from '@lumimax/config';
import type { CloudIotVendorName } from '@lumimax/config';
import { getDefaultLocale } from '../../config/default-locale';
import { normalizeDietMarket } from '../../diet/market/diet-market';
import { IotDispatcherService } from '../pipeline/iot-dispatcher.service';
import {
  BizIotTopicKind,
  type BizIotDispatchResult,
  type NormalizedBizIotMessage,
} from '../iot.types';

export interface DeviceProtocolDebugContext {
  deviceSn: string;
  internalDeviceId: string;
  locale: string;
  market?: string;
  requestId: string;
  userId?: string;
  vendor: CloudIotVendorName;
}

@Injectable()
export class DeviceProtocolDebugService {
  constructor(
    @Inject(IotDispatcherService) private readonly iotDispatcherService: IotDispatcherService,
  ) {}

  async requestUploadUrl(input: {
    context: DeviceProtocolDebugContext;
    fileType?: string;
    filename?: string;
  }) {
    const result = await this.dispatchEvent(input.context, {
      event: 'upload.url.request',
      payload: {
        ...(input.filename ? { filename: input.filename } : {}),
        ...(input.fileType ? { fileType: input.fileType } : { fileType: 'image/jpeg' }),
      },
    });
    return {
      ...summarizeStep('upload.url.request', result),
      upload: extractUploadPayload(result),
    };
  }

  async runFoodRecognitionChain(input: {
    context: DeviceProtocolDebugContext;
    objectKey: string;
    weightGram: number;
  }) {
    const objectKey = input.objectKey.trim();
    if (!objectKey) {
      throw new BadRequestException('objectKey is required');
    }
    const weightGram = input.weightGram;
    if (!Number.isFinite(weightGram) || weightGram <= 0) {
      throw new BadRequestException('weightGram must be a positive number');
    }

    const steps: Array<Record<string, unknown>> = [];

    const mealResult = await this.dispatchEvent(input.context, {
      event: 'meal.record.create',
      payload: {
        ...(input.context.userId ? { userId: input.context.userId } : {}),
      },
    });
    steps.push(summarizeStep('meal.record.create', mealResult));

    const mealRecordId =
      pickString(mealResult.downlink?.data?.mealRecordId)
      ?? pickString(mealResult.data?.mealRecordId);
    if (!mealRecordId) {
      throw new BadRequestException('meal.record.create did not return mealRecordId');
    }

    const analysisResult = await this.dispatchEvent(input.context, {
      event: 'food.analysis.request',
      payload: {
        mealRecordId,
        type: 'image',
        target: objectKey,
        weight: weightGram,
        ...(input.context.userId ? { userId: input.context.userId } : {}),
        ...(input.context.market ? { market: input.context.market } : {}),
      },
    });
    steps.push(summarizeStep('food.analysis.request', analysisResult));

    return {
      deviceSn: input.context.deviceSn,
      internalDeviceId: input.context.internalDeviceId,
      mealRecordId,
      objectKey,
      weightGram,
      steps,
      downlink: analysisResult.downlink?.data ?? null,
      requiresUserConfirmation: analysisResult.downlink?.data?.requiresUserConfirmation ?? null,
    };
  }

  private async dispatchEvent(
    context: DeviceProtocolDebugContext,
    input: { event: string; payload: Record<string, unknown> },
  ): Promise<BizIotDispatchResult> {
    return this.iotDispatcherService.dispatch(this.buildEventMessage(context, input));
  }

  private buildEventMessage(
    context: DeviceProtocolDebugContext,
    input: { event: string; payload: Record<string, unknown> },
  ): NormalizedBizIotMessage {
    const receivedAt = new Date();
    return {
      vendor: context.vendor,
      topic: `v1/event/${context.deviceSn}/req`,
      topicKind: BizIotTopicKind.EVENT_REQ,
      deviceId: context.deviceSn,
      requestId: context.requestId,
      event: input.event,
      locale: context.locale,
      payload: input.payload,
      timestamp: receivedAt.getTime(),
      receivedAt,
    };
  }
}

export function buildDeviceProtocolDebugContext(input: {
  deviceSn: string;
  internalDeviceId: string;
  locale?: string;
  market?: string;
  requestId?: string;
  userId?: string;
}): DeviceProtocolDebugContext {
  const deviceSn = input.deviceSn.trim();
  if (!deviceSn) {
    throw new BadRequestException('deviceSn is required');
  }
  return {
    deviceSn,
    internalDeviceId: input.internalDeviceId,
    locale: input.locale?.trim() || getDefaultLocale(),
    market: input.market ? normalizeDietMarket(input.market) : undefined,
    requestId: input.requestId?.trim() || generateId(),
    userId: input.userId?.trim() || undefined,
    vendor: resolveConfiguredIotVendor(),
  };
}

function summarizeStep(event: string, result: BizIotDispatchResult) {
  return {
    event,
    accepted: result.accepted,
    skipped: result.skipped ?? false,
    handledBy: result.handledBy ?? null,
    requestId: result.requestId,
    downlink: result.downlink
      ? {
          event: result.downlink.event,
          data: result.downlink.data ?? {},
        }
      : null,
    data: result.data ?? null,
  };
}

function extractUploadPayload(result: BizIotDispatchResult) {
  const payload = {
    ...(result.downlink?.data ?? {}),
    ...(result.data ?? {}),
  };
  return {
    objectKey: pickString(payload.objectKey) ?? pickString(payload.imageKey) ?? '',
    uploadUrl: pickString(payload.uploadUrl) ?? null,
    method: pickString(payload.method) ?? 'PUT',
    headers: asRecord(payload.headers),
    expiresAt: payload.expiresAt ?? null,
    maxFileSize: pickNumber(payload.maxFileSize) ?? pickNumber(payload.maxBytes) ?? null,
    provider: pickString(payload.provider) ?? null,
    bucket: pickString(payload.bucket) ?? null,
    region: pickString(payload.region) ?? null,
  };
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function pickNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
