import { Inject, Injectable } from '@nestjs/common';
import { getDefaultLocale } from '../../config/default-locale';
import type { DeviceCloudInboundPort } from '../../device/devices/device-cloud-inbound.port';
import { DEVICE_CLOUD_INBOUND_PORT } from '../../device/devices/device-cloud-inbound.port';
import { BaseStorageGrpcAdapter } from '../../grpc/base-service.grpc-client';
import { DietFacade } from '../../diet/diet.facade';
import { normalizeDietMarket } from '../../diet/market/diet-market';
import {
  BizIotTopicKind,
  type BizIotDispatchResult,
  type NormalizedBizIotMessage,
} from '../iot.types';

@Injectable()
export class IotDispatcherService {
  constructor(
    @Inject(DEVICE_CLOUD_INBOUND_PORT)
    private readonly deviceCloudInboundService: DeviceCloudInboundPort,
    @Inject(DietFacade) private readonly dietFacade: DietFacade,
    @Inject(BaseStorageGrpcAdapter)
    private readonly baseStorageGrpcAdapter: BaseStorageGrpcAdapter,
  ) {}

  async dispatch(message: NormalizedBizIotMessage): Promise<BizIotDispatchResult> {
    switch (message.topicKind) {
      case BizIotTopicKind.CONNECT_REQ:
      case BizIotTopicKind.STATUS_REQ:
        return this.handleConnect(message);
      case BizIotTopicKind.EVENT_REQ:
        return this.handleEvent(message);
      case BizIotTopicKind.ATTR_REQ:
        return this.handleAttrRequest(message);
      case BizIotTopicKind.CMD_REQ:
        return this.handleCmdRequest(message);
      default:
        return {
          accepted: true,
          skipped: true,
          reason: `unsupported topic kind ${message.topicKind}`,
          requestId: message.requestId,
        };
    }
  }

  private async handleConnect(
    message: NormalizedBizIotMessage,
  ): Promise<BizIotDispatchResult> {
    if (message.topicKind === BizIotTopicKind.CONNECT_REQ) {
      if (message.event !== 'connect.register') {
        return {
          accepted: true,
          skipped: true,
          reason: `unsupported connect event ${message.event}`,
          requestId: message.requestId,
        };
      }
      const data = await this.deviceCloudInboundService.activateFromCloud(
        {
          vendor: message.vendor,
          providerDeviceId: message.deviceId,
          activatedAt: message.receivedAt.toISOString(),
          locale:
            pickString(message.payload.locale) ?? pickString(message.locale) ?? getDefaultLocale(),
          firmwareVersion: pickString(message.payload.firmwareVersion),
          hardwareVersion: pickString(message.payload.hardwareVersion),
          protocolVersion: pickString(message.payload.protocolVersion),
          networkStatus:
            pickString(message.payload.networkStatus) ?? pickString(message.payload.network),
          network: pickString(message.payload.network),
          source: 'device_connect_register',
        },
        message.requestId,
      );
      return {
        accepted: true,
        handledBy: 'device.connect',
        requestId: message.requestId,
        data,
        downlink: {
          topicKind: BizIotTopicKind.CONNECT_RES,
          event: 'connect.register.result',
          data: {
            code: 0,
            msg: 'ok',
            deviceId: pickString(data.id) ?? message.deviceId,
            status: pickString(data.status) ?? 'active',
          },
          qos: 1,
        },
      };
    }

    if (message.event === 'status.heartbeat') {
      const data = await this.deviceCloudInboundService.recordHeartbeatTelemetry(
        {
          ...message.payload,
          vendor: message.vendor,
          providerDeviceId: message.deviceId,
          lastSeenAt: message.receivedAt.toISOString(),
          source: 'device_heartbeat',
        },
        message.requestId,
      );
      return {
        accepted: true,
        handledBy: 'device.heartbeat',
        requestId: message.requestId,
        data,
      };
    }

    return {
      accepted: true,
      skipped: true,
      reason: `status event recorded only: ${message.event}`,
      requestId: message.requestId,
    };
  }

  private async handleAttrRequest(
    message: NormalizedBizIotMessage,
  ): Promise<BizIotDispatchResult> {
    if (message.event !== 'attr.set.result') {
      return {
        accepted: true,
        skipped: true,
        reason: `unsupported attr event ${message.event}`,
        requestId: message.requestId,
      };
    }
    const data = await this.deviceCloudInboundService.applyAttrResult(
      {
        ...message.payload,
        event: message.event,
        deviceId: message.deviceId,
      },
      message.requestId,
    );
    return {
      accepted: true,
      handledBy: 'attr.response',
      requestId: message.requestId,
      data,
    };
  }

  private async handleCmdRequest(
    message: NormalizedBizIotMessage,
  ): Promise<BizIotDispatchResult> {
    const data = await this.deviceCloudInboundService.handleCommandResult(
      {
        ...message.payload,
        event: message.event,
        deviceId: message.deviceId,
      },
      message.requestId,
    );
    return {
      accepted: true,
      handledBy: 'cmd.response',
      requestId: message.requestId,
      data,
    };
  }

  private async handleEvent(
    message: NormalizedBizIotMessage,
  ): Promise<BizIotDispatchResult> {
    switch (message.event) {
      case 'upload.token.request':
        return this.handleUploadTokenRequest(message);
      case 'upload.url.request':
        return this.handleUploadUrlRequest(message);
      case 'meal.record.create':
        return this.handleMealRecordCreate(message);
      case 'food.analysis.request':
        return this.handleFoodAnalysisRequest(message);
      case 'food.analysis.confirm.request':
        return this.handleFoodAnalysisConfirmRequest(message);
      case 'nutrition.analysis.request':
        return this.handleNutritionAnalysisRequest(message);
      default:
        return {
          accepted: true,
          skipped: true,
          reason: `unsupported event ${message.event}`,
          requestId: message.requestId,
        };
    }
  }

  private async handleUploadTokenRequest(
    message: NormalizedBizIotMessage,
  ): Promise<BizIotDispatchResult> {
    return this.issueTemporaryUploadForDevice(message, {
      handledBy: 'upload.token.request',
      resultEvent: 'upload.token.result',
      storageMode: 'credentials',
    });
  }

  private async handleUploadUrlRequest(
    message: NormalizedBizIotMessage,
  ): Promise<BizIotDispatchResult> {
    return this.issueTemporaryUploadForDevice(message, {
      handledBy: 'upload.url.request',
      resultEvent: 'upload.url.result',
      storageMode: 'presigned-url',
    });
  }

  private async issueTemporaryUploadForDevice(
    message: NormalizedBizIotMessage,
    options: {
      handledBy: string;
      resultEvent: 'upload.token.result' | 'upload.url.result';
      storageMode?: 'presigned-url' | 'credentials';
    },
  ): Promise<BizIotDispatchResult> {
    const imageKey =
      pickString(message.payload.imageKey) || pickString(message.payload.image_key);
    const filename = pickString(message.payload.filename);
    const safeFilename = filename && filename !== imageKey ? filename : undefined;
    const body: Record<string, unknown> = {
      deviceId: message.deviceId,
      filename: safeFilename,
      maxFileSize:
        pickNumber(message.payload.maxBytes) ?? pickNumber(message.payload.maxFileSize),
      allowedMimeTypes: deriveUploadMimeTypes(message.payload),
    };
    if (options.storageMode) {
      body.mode = options.storageMode;
    }
    const data = await this.baseStorageGrpcAdapter.execute<Record<string, unknown>>({
      operation: 'storage.createTemporaryUploadCredential',
      body,
      requestId: message.requestId,
    });
    return {
      accepted: true,
      handledBy: options.handledBy,
      requestId: message.requestId,
      data,
      downlink: {
        topicKind: BizIotTopicKind.EVENT_RES,
        event: options.resultEvent,
        data: buildTemporaryUploadResultPayload(data),
        qos: 1,
      },
    };
  }

  private async handleMealRecordCreate(
    message: NormalizedBizIotMessage,
  ): Promise<BizIotDispatchResult> {
    const data = await this.dietFacade.createMealRecord({
      userId:
        pickString(message.payload.userId)
        || pickString(message.payload.user_id)
        || message.deviceId,
      deviceId: message.deviceId,
      requestId: message.requestId,
    });
    return {
      accepted: true,
      handledBy: 'meal.create',
      requestId: message.requestId,
      data,
      downlink: {
        topicKind: BizIotTopicKind.EVENT_RES,
        event: 'meal.record.result',
        data: {
          code: 0,
          msg: 'ok',
          mealRecordId: pickString(data.mealRecordId) ?? '',
          status: 'active',
          startedAt: toEpochMillis(data.startedAt, message.receivedAt),
        },
        qos: 1,
      },
    };
  }

  private async handleFoodAnalysisRequest(
    message: NormalizedBizIotMessage,
  ): Promise<BizIotDispatchResult> {
    const mealRecordId = pickString(message.payload.mealRecordId);
    const analysisType = parseFoodAnalysisType(message.payload.type);
    const target = pickString(message.payload.target);
    const requestedUserId =
      pickString(message.payload.userId) || pickString(message.payload.user_id);
    const weightGrams = pickNumber(message.payload.weight);

    if (!mealRecordId || !weightGrams) {
      throw new Error('food.analysis.request missing mealRecordId/weight');
    }
    if (!target) {
      throw new Error('food.analysis.request missing target');
    }

    const data = await this.dietFacade.analyzeFoodItem({
      mealRecordId,
      userId: requestedUserId ?? message.deviceId,
      deviceId: message.deviceId,
      type: analysisType,
      target,
      weightGram: weightGrams,
      locale: pickString(message.payload.locale) ?? pickString(message.locale) ?? getDefaultLocale(),
      market: normalizeDietMarket(pickString(message.payload.market)),
      requestId: message.requestId,
    });
    return {
      accepted: true,
      handledBy: 'meal.food.analyze',
      requestId: message.requestId,
      data,
      downlink: {
        topicKind: BizIotTopicKind.EVENT_RES,
        event: 'food.analysis.result',
        data: buildFoodAnalysisResultPayload({
          data,
          mealRecordId,
          weightGrams,
        }),
        qos: 1,
      },
    };
  }

  private async handleFoodAnalysisConfirmRequest(
    message: NormalizedBizIotMessage,
  ): Promise<BizIotDispatchResult> {
    const mealRecordId = pickString(message.payload.mealRecordId);
    const foodItemId =
      pickString(message.payload.foodItemId) || pickString(message.payload.itemId);
    const selectedFoodName =
      pickString(message.payload.selectedFoodName) ||
      pickString(message.payload.foodName) ||
      pickString(message.payload.correctedName);
    const selectedFoodId = pickString(message.payload.selectedFoodId);
    const requestedUserId =
      pickString(message.payload.userId) || pickString(message.payload.user_id);
    const correctedCount = pickNumber(message.payload.correctedCount);
    const weightGram =
      pickNumber(message.payload.weightGram) ||
      pickNumber(message.payload.correctedWeightGram) ||
      pickNumber(message.payload.weight);

    if (!mealRecordId || !foodItemId || !selectedFoodName) {
      throw new Error('food.analysis.confirm.request missing mealRecordId/foodItemId/selectedFoodName');
    }

    const data = await this.dietFacade.confirmFoodItem({
      mealRecordId,
      itemId: foodItemId,
      userId: requestedUserId ?? message.deviceId,
      foodName: selectedFoodName,
      selectedFoodId,
      correctedCount,
      confirmationSource: pickConfirmationSource(message.payload.confirmationSource),
      weightGram,
      locale: pickString(message.payload.locale) ?? pickString(message.locale) ?? getDefaultLocale(),
      market: normalizeDietMarket(pickString(message.payload.market)),
      requestId: message.requestId,
    });
    return {
      accepted: true,
      handledBy: 'meal.food.confirm',
      requestId: message.requestId,
      data,
      downlink: {
        topicKind: BizIotTopicKind.EVENT_RES,
        event: 'food.analysis.confirm.result',
        data: {
          code: 0,
          msg: 'ok',
          mealRecordId,
          foodItemId,
          status: 'confirmed',
          confirmationSource: pickString(data.confirmationSource) ?? 'recognized',
        },
        qos: 1,
      },
    };
  }

  private async handleNutritionAnalysisRequest(
    message: NormalizedBizIotMessage,
  ): Promise<BizIotDispatchResult> {
    const mealRecordId = pickString(message.payload.mealRecordId);
    if (!mealRecordId) {
      throw new Error('nutrition.analysis.request missing mealRecordId');
    }
    const data = await this.dietFacade.finishMealRecord({
      mealRecordId,
      userId: message.deviceId,
      requestId: message.requestId,
    });
    return {
      accepted: true,
      handledBy: 'meal.finish',
      requestId: message.requestId,
      data,
      downlink: {
        topicKind: BizIotTopicKind.EVENT_RES,
        event: 'nutrition.analysis.result',
        data: {
          code: 0,
          msg: 'ok',
          mealRecordId: pickString(data.mealRecordId) ?? mealRecordId,
          status: pickString(data.status) ?? 'finished',
          foodItemCount: pickNumber(asRecord(data.total).itemCount) ?? 0,
          totalCalories: pickNumber(asRecord(data.total).calories) ?? 0,
          nutritionSummary: summarizeNutrition(data.items),
          finishedAt: toEpochMillis(data.finishedAt, message.receivedAt),
        },
        qos: 1,
      },
    };
  }
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function pickConfirmationSource(value: unknown):
  | 'recognized'
  | 'user_common_selected'
  | 'system_search_selected'
  | 'retry_recognition_selected'
  | undefined {
  const normalized = pickString(value);
  switch (normalized) {
    case 'recognized':
    case 'user_common_selected':
    case 'system_search_selected':
    case 'retry_recognition_selected':
      return normalized;
    default:
      return undefined;
  }
}

function pickNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function deriveUploadMimeTypes(payload: Record<string, unknown>): string[] | undefined {
  const fileType = pickString(payload.fileType);
  if (fileType) {
    return [fileType];
  }
  return pickStringArray(payload.allowedMimeTypes, payload.fileTypes);
}

function toEpochMillis(value: unknown, fallback: Date): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback.getTime();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function buildTemporaryUploadResultPayload(data: Record<string, unknown>): Record<string, unknown> {
  const mode = pickString(data.mode);
  const uploadMode = pickString(data.uploadMode) ?? 'presigned_put';
  const credentials = asRecord(data.credentials);
  const result: Record<string, unknown> = {
    code: 0,
    msg: 'ok',
    provider: pickString(data.provider) ?? '',
    uploadMode,
    bucket: pickString(data.bucket) ?? '',
    region: pickString(data.region) ?? '',
    objectKey: pickString(data.objectKey) ?? '',
    expiresAt: pickNumber(data.expiresAt) ?? Date.now(),
    maxBytes: pickNumber(data.maxFileSize) ?? pickNumber(data.maxBytes) ?? 0,
  };
  const tmpPrefix = pickString(data.tmpPrefix);
  if (mode) {
    result.mode = mode;
  }
  if (tmpPrefix) {
    result.tmpPrefix = tmpPrefix;
  }
  if (Object.keys(credentials).length > 0) {
    result.credentials = credentials;
  }
  if (mode === 'presigned-url' || uploadMode === 'presigned_put') {
    result.uploadUrl = pickString(data.uploadUrl) ?? '';
    result.method = pickString(data.method) ?? 'PUT';
    result.headers = asRecord(data.headers);
  }
  return result;
}

function buildFoodAnalysisResultPayload(input: {
  data: Record<string, unknown>;
  mealRecordId: string;
  weightGrams: number;
}): Record<string, unknown> {
  const food = buildFoodAnalysisFood(input.data, input.weightGrams);
  const result: Record<string, unknown> = {
    code: 0,
    msg: 'ok',
    mealRecordId: input.mealRecordId,
    foodItemId: pickString(input.data.itemId) ?? '',
    status: 'success',
    candidates: buildFoodAnalysisCandidates(input.data.confirmationOptions),
    requiresUserConfirmation: Boolean(input.data.requiresUserConfirmation),
  };
  if (food) {
    result.food = food;
  }
  const mealTotal = asRecord(input.data.mealTotal);
  if (Object.keys(mealTotal).length > 0) {
    result.mealTotal = mealTotal;
  }
  return result;
}

function buildFoodAnalysisFood(
  data: Record<string, unknown>,
  weightGrams: number,
): Record<string, unknown> | null {
  const rawItems = Array.isArray(data.items) ? data.items : [];
  if (rawItems.length === 0) {
    return null;
  }
  const record = asRecord(rawItems[0]);
  const estimatedNutrition = asRecord(data.estimatedNutrition);
  return {
    id: pickString(record.itemId) ?? pickString(data.itemId) ?? '',
    type: pickString(record.type) ?? 'ingredient',
    name: pickString(record.name) ?? '',
    displayName: pickString(record.displayName) ?? pickString(record.name) ?? '',
    canonicalName: pickString(record.canonicalName) ?? '',
    quantity: pickNumber(record.quantity) ?? null,
    weightGram: pickNumber(record.measuredWeightGram) ?? weightGrams,
    estimatedWeightGram: pickNumber(record.estimatedWeightGram) ?? null,
    confidence: pickNumber(record.confidence) ?? 0,
    source: pickString(record.source) ?? pickString(estimatedNutrition.source) ?? 'food-query',
    provider: pickString(record.provider) ?? pickString(estimatedNutrition.provider) ?? '',
    verifiedLevel: pickString(record.verifiedLevel) ?? pickString(estimatedNutrition.verifiedLevel) ?? null,
    nutrition: {
      calories: pickNumber(record.calories) ?? pickNumber(estimatedNutrition.calories) ?? 0,
      protein: pickNumber(record.protein) ?? pickNumber(estimatedNutrition.protein) ?? 0,
      fat: pickNumber(record.fat) ?? pickNumber(estimatedNutrition.fat) ?? 0,
      carbs: pickNumber(record.carbs) ?? pickNumber(estimatedNutrition.carbs) ?? 0,
      fiber: pickNumber(record.fiber) ?? 0,
    },
    children: Array.isArray(record.children) ? record.children : [],
  };
}

function buildFoodAnalysisCandidates(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => asRecord(item))
    .map((item) => ({
      optionId: pickString(item.optionId) ?? '',
      foodName: pickString(item.foodName) ?? '',
      displayName: pickString(item.displayName) ?? pickString(item.foodName) ?? '',
      canonicalName: pickString(item.canonicalName) ?? '',
      source: pickString(item.source) ?? '',
      provider: pickString(item.provider) ?? '',
      confidence: pickNumber(item.confidence) ?? null,
    }));
}

function summarizeNutrition(items: unknown): Record<string, number> {
  if (!Array.isArray(items)) {
    return {
      protein: 0,
      fat: 0,
      carbohydrate: 0,
      fiber: 0,
    };
  }
  let protein = 0;
  let fat = 0;
  let carbohydrate = 0;
  for (const item of items) {
    const record = asRecord(item);
    protein += pickNumber(record.protein) ?? 0;
    fat += pickNumber(record.fat) ?? 0;
    carbohydrate += pickNumber(record.carbs) ?? 0;
  }
  return {
    protein: round(protein),
    fat: round(fat),
    carbohydrate: round(carbohydrate),
    fiber: 0,
  };
}

function parseFoodAnalysisType(value: unknown): 'image' | 'barcode' | 'text' | 'voice' {
  switch (pickString(value)?.trim().toLowerCase()) {
    case 'barcode':
      return 'barcode';
    case 'text':
      return 'text';
    case 'voice':
      return 'voice';
    case 'image':
    case undefined:
      return 'image';
    default:
      throw new Error('food.analysis.request invalid type');
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function pickStringArray(...values: unknown[]): string[] | undefined {
  const found = values.find((value) => Array.isArray(value));
  if (!Array.isArray(found)) return undefined;
  const items = found.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return items.length > 0 ? items : undefined;
}
