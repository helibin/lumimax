import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@lumimax/auth';
import {
  buildGatewayGrpcError,
  buildGatewayGrpcSuccess,
} from '@lumimax/integration/grpc/gateway-grpc.util';
import { resolveTenantId } from '../common/tenant-scope.util';
import { RecognitionLogService } from './food-analysis/recognition-log.service';
import { FoodService } from './food/food.service';
import { normalizeDietMarket } from './market/diet-market';
import { DietApplicationService } from './meal/diet-application.service';
import { DietImageStorageService } from './food-analysis/diet-image-storage.service';

@Injectable()
export class DietFacade {
  constructor(
    @Inject(DietApplicationService)
    private readonly dietApplicationService: DietApplicationService,
    @Inject(DietImageStorageService)
    private readonly dietImageStorageService: DietImageStorageService,
    @Inject(RecognitionLogService)
    private readonly recognitionLogService: RecognitionLogService,
    @Inject(FoodService) private readonly foodService: FoodService,
  ) {}

  async execute(input: {
    operation: string;
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    user?: AuthenticatedUser | null;
    tenantScope?: string;
    requestId: string;
  }) {
    try {
      const data = await this.dispatch(input);
      return buildGatewayGrpcSuccess(data, input.requestId);
    } catch (error) {
      return buildGatewayGrpcError(error, input.requestId);
    }
  }

  callAdmin<T>(input: {
    service: 'meals' | 'foods' | 'recognitionLogs';
    method: string;
    payload?: Record<string, unknown>;
    tenantId: string;
    requestId: string;
  }): Promise<T> {
    switch (input.service) {
      case 'meals':
        return this.dietApplicationService.callAdmin<T>({
          service: 'meals',
          method: input.method,
          payload: input.payload,
          requestId: input.requestId,
        });
      case 'foods':
        return this.foodService.callAdmin<T>({
          method: input.method,
          payload: input.payload,
          tenantId: input.tenantId,
          requestId: input.requestId,
        });
      case 'recognitionLogs':
        return this.recognitionLogService.callAdmin<T>({
          method: input.method,
          payload: input.payload,
        });
      default:
        throw new Error(`Unsupported diet admin service: ${input.service satisfies never}`);
    }
  }

  createMealRecord(input: {
    userId: string;
    deviceId: string;
    locale?: string;
    market?: string;
    requestId: string;
  }): Promise<Record<string, unknown>> {
    return this.dietApplicationService.createMealRecord(input);
  }

  async analyzeFoodItem(input: {
    mealRecordId: string;
    userId: string;
    deviceId: string;
    type: 'image' | 'barcode' | 'text' | 'voice';
    target: string;
    weightGram: number;
    locale?: string;
    market?: string;
    requestId: string;
  }): Promise<Record<string, unknown>> {
    await this.dietApplicationService.assertMealReadyForAnalysis(
      input.mealRecordId,
      input.userId,
    );
    if (input.type === 'image') {
      const preparedImage = await this.dietImageStorageService.prepareSingleImage({
        requestId: input.requestId,
        mealRecordId: input.mealRecordId,
        imageKey: input.target,
        userId: input.userId,
        deviceId: input.deviceId,
      });

      return this.dietApplicationService.analyzeFoodItem({
        ...input,
        imageKey: preparedImage.imageKey,
        imageUrl: preparedImage.readUrl,
        imageObjectId: preparedImage.imageObjectKey,
      });
    }

    return this.dietApplicationService.analyzeFoodItem(input);
  }

  async finishMealRecord(input: {
    mealRecordId: string;
    userId: string;
    requestId: string;
  }): Promise<Record<string, unknown>> {
    return this.dietApplicationService.finishMealRecord(input);
  }

  async confirmFoodItem(input: {
    mealRecordId: string;
    itemId: string;
    userId: string;
    foodName: string;
    selectedFoodId?: string;
    correctedCount?: number;
    confirmationSource?:
      | 'recognized'
      | 'user_common_selected'
      | 'system_search_selected'
      | 'retry_recognition_selected';
    weightGram?: number;
    locale?: string;
    market?: string;
    requestId: string;
  }): Promise<Record<string, unknown>> {
    return this.dietApplicationService.confirmFoodItem(input);
  }

  private async dispatch(input: {
    operation: string;
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    user?: AuthenticatedUser | null;
    tenantScope?: string;
    requestId: string;
  }): Promise<Record<string, unknown>> {
    const userId = requireUserId(input.user);
    const tenantId = resolveTenantId(input.tenantScope);
    const params = input.params ?? {};
    const query = input.query ?? {};
    const body = input.body ?? {};

    switch (input.operation) {
      case 'meals.create':
        return this.dietApplicationService.createMealRecord({
          userId,
          deviceId: pickString(body.deviceId) ?? userId,
          locale: pickString(body.locale),
          market: normalizeDietMarket(pickString(body.market)),
          requestId: input.requestId,
        });
      case 'meals.items.analyze': {
        const mealRecordId = pickString(params.id) ?? pickString(body.mealRecordId);
        const sourceImageKey = pickString(body.imageKey);
        const weightGram = pickNumber(body.weightGram) ?? pickNumber(body.weight);
        if (!mealRecordId || !sourceImageKey || !weightGram) {
          throw new Error('meal analyze requires id, imageKey and weightGram');
        }
        return this.analyzeFoodItem({
          mealRecordId,
          userId,
          deviceId: pickString(body.deviceId) ?? userId,
          type: 'image',
          target: sourceImageKey,
          weightGram,
          locale: pickString(body.locale),
          market: normalizeDietMarket(pickString(body.market)),
          requestId: input.requestId,
        });
      }
      case 'meals.items.confirm': {
        const mealRecordId = pickString(params.id) ?? pickString(body.mealRecordId);
        const itemId = pickString(params.itemId) ?? pickString(body.itemId);
        const foodName =
          pickString(body.correctedName)
          ?? pickString(body.selectedFoodName)
          ?? pickString(body.foodName)
          ?? pickString(body.name);
        if (!mealRecordId || !itemId || !foodName) {
          throw new Error('meal confirm requires mealRecordId, itemId and foodName');
        }
        return this.confirmFoodItem({
          mealRecordId,
          itemId,
          userId,
          foodName,
          selectedFoodId: pickString(body.selectedFoodId),
          correctedCount: pickNumber(body.correctedCount),
          confirmationSource: pickConfirmationSource(body.confirmationSource),
          weightGram:
            pickNumber(body.correctedWeightGram)
            ?? pickNumber(body.weightGram)
            ?? pickNumber(body.weight),
          locale: pickString(body.locale),
          market: normalizeDietMarket(pickString(body.market)),
          requestId: input.requestId,
        });
      }
      case 'meals.finish': {
        const mealRecordId = pickString(params.id) ?? pickString(body.mealRecordId);
        if (!mealRecordId) {
          throw new Error('meal finish requires id');
        }
        return this.finishMealRecord({
          mealRecordId,
          userId,
          requestId: input.requestId,
        });
      }
      case 'meals.list':
        return this.dietApplicationService.listMealsByUser({
          userId,
          page: pickNumber(query.page) ?? 1,
          pageSize: pickNumber(query.pageSize) ?? 20,
        });
      case 'meals.get': {
        const mealRecordId = pickString(params.id);
        if (!mealRecordId) {
          throw new Error('meal get requires id');
        }
        return this.dietApplicationService.getMealByUser({
          mealRecordId,
          userId,
        });
      }
      case 'foods.suggest':
        return this.foodService.suggestFoods({
          userId,
          tenantId,
          query: pickString(query.q) ?? pickString(query.query) ?? pickString(body.query) ?? '',
          limit: pickNumber(query.limit) ?? pickNumber(body.limit) ?? 5,
          locale: pickString(query.locale) ?? pickString(body.locale),
          market: pickString(query.market) ?? pickString(body.market),
        });
      default:
        throw new Error(`Unsupported biz diet execute operation: ${input.operation}`);
    }
  }
}

function requireUserId(user?: AuthenticatedUser | null): string {
  const userId = user?.userId?.trim();
  if (!userId) {
    throw new Error('Missing user context');
  }
  return userId;
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
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
