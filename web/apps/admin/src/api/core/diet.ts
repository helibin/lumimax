import { requestClient } from '#/api/request';

import { normalizeAdminPaged } from './admin-response';

export namespace DietApi {
  export type MealStatus = 'active' | 'analyzing' | 'created' | 'finished' | string;

  export type RecognitionStatus =
    | 'confirmed'
    | 'corrected'
    | 'pending'
    | 'success'
    | string;

  export interface MealRecordItem {
    deviceId: null | string;
    finishedAt: null | string;
    locale: null | string;
    market: null | string;
    mealRecordId: string;
    startedAt: null | string;
    status: MealStatus;
    totalCalories: number;
    totalWeight: number;
    userId: null | string;
  }

  export interface MealRecordDetail extends MealRecordItem {
    items: MealItem[];
  }

  export interface MealItem {
    calories: number;
    carbs: number;
    createdAt: string;
    fat: number;
    foodId: null | string;
    foodName: string;
    imageKey: null | string;
    imageObjectId: null | string;
    imagePreviewUrl: null | string;
    itemId: string;
    locale: null | string;
    market: null | string;
    mealRecordId: string;
    protein: number;
    querySnapshot: unknown;
    rawCandidates: unknown;
    recognitionSnapshot: unknown;
    recognitionStatus: RecognitionStatus;
    recognitionLatencyMs: null | number;
    resultSnapshot: unknown;
    selectedCandidate: unknown;
    source: null | string;
    weight: number;
  }

  export interface RecognitionLogItem {
    createdAt: string;
    deviceId: string;
    id: string;
    imageKey: string;
    latencyMs: null | number;
    mealId: string;
    mealRecordId: string;
    provider: string;
    requestId: string;
    status: string;
  }

  export interface RecognitionLogDetail extends RecognitionLogItem {
    error: unknown;
    requestPayload: unknown;
    responsePayload: unknown;
  }

  export interface InternalFoodItem {
    brand: null | string;
    caloriesPer100g: number;
    carbsPer100g: number;
    countryCode: null | string;
    createdAt: null | string;
    fatPer100g: number;
    id: string;
    name: string;
    proteinPer100g: number;
    servingSize: number;
    servingUnit: string;
    source: null | string;
    sourceRefId: null | string;
    status: string;
    updatedAt: null | string;
  }

  export interface UserCommonFoodItem {
    caloriesPer100g: number;
    canonicalName: string;
    carbsPer100g: number;
    defaultWeightGram: number;
    fatPer100g: number;
    foodId: null | string;
    foodName: string;
    lastUsedAt: null | string;
    normalizedName: string;
    proteinPer100g: number;
    rowKey: string;
    source: string;
    usageCount: number;
    userId: string;
  }
}

interface PagedResult<T> {
  items: T[];
  total: number;
}

function pickObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function pickNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function pickNullableNumber(value: unknown): null | number {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeJsonValue(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }
  return value;
}

function normalizeMealRecordItem(payload: unknown): DietApi.MealRecordItem {
  const item = pickObject(payload);
  return {
    mealRecordId: pickString(item.mealRecordId) || pickString(item.id),
    userId: pickString(item.userId) || null,
    deviceId: pickString(item.deviceId) || null,
    status: pickString(item.status),
    startedAt: pickString(item.startedAt) || null,
    finishedAt: pickString(item.finishedAt) || null,
    totalCalories: pickNumber(item.totalCalories),
    totalWeight: pickNumber(item.totalWeight),
    locale: pickString(item.locale) || null,
    market: pickString(item.market) || null,
  };
}

function normalizeMealItem(payload: unknown): DietApi.MealItem {
  const item = pickObject(payload);
  return {
    itemId: pickString(item.itemId) || pickString(item.id),
    mealRecordId: pickString(item.mealRecordId),
    foodName: pickString(item.foodName),
    weight: pickNumber(item.weight),
    calories: pickNumber(item.calories),
    protein: pickNumber(item.protein),
    fat: pickNumber(item.fat),
    carbs: pickNumber(item.carbs),
    source: pickString(item.source) || null,
    imageKey: pickString(item.imageKey) || null,
    imageObjectId: pickString(item.imageObjectId) || null,
    imagePreviewUrl: pickString(item.imagePreviewUrl) || null,
    recognitionStatus: pickString(item.recognitionStatus),
    foodId: pickString(item.foodId) || null,
    locale: pickString(item.locale) || null,
    market: pickString(item.market) || null,
    createdAt: pickString(item.createdAt),
    recognitionLatencyMs: pickNullableNumber(item.recognitionLatencyMs),
    querySnapshot: normalizeJsonValue(item.querySnapshot),
    recognitionSnapshot: normalizeJsonValue(item.recognitionSnapshot),
    resultSnapshot: normalizeJsonValue(item.resultSnapshot),
    rawCandidates: normalizeJsonValue(item.rawCandidates),
    selectedCandidate: normalizeJsonValue(item.selectedCandidate),
  };
}

function normalizeRecognitionLogItem(payload: unknown): DietApi.RecognitionLogItem {
  const item = pickObject(payload);
  const mealRecordId = pickString(item.mealRecordId) || pickString(item.mealId);
  return {
    id: pickString(item.id),
    requestId: pickString(item.requestId),
    deviceId: pickString(item.deviceId),
    mealRecordId,
    mealId: mealRecordId,
    imageKey: pickString(item.imageKey),
    provider: pickString(item.provider),
    status: pickString(item.status),
    latencyMs: pickNullableNumber(item.latencyMs),
    createdAt: pickString(item.createdAt),
  };
}

function normalizeRecognitionLogDetail(payload: unknown): DietApi.RecognitionLogDetail {
  const item = pickObject(payload);
  return {
    ...normalizeRecognitionLogItem(item),
    requestPayload: normalizeJsonValue(item.requestPayload),
    responsePayload: normalizeJsonValue(item.responsePayload),
    error: normalizeJsonValue(item.error),
  };
}

export async function getMealRecordListApi(params?: {
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  const response = await requestClient.get<unknown>('/admin/meals', { params });
  const paged = normalizeAdminPaged(response);
  return {
    items: paged.items.map((item) => normalizeMealRecordItem(item)),
    total: paged.total,
  } satisfies PagedResult<DietApi.MealRecordItem>;
}

export async function getMealRecordDetailApi(mealRecordId: string) {
  const response = await requestClient.get<unknown>(
    `/admin/meals/${encodeURIComponent(mealRecordId)}`,
  );
  const target = pickObject(response);
  const items = Array.isArray(target.items) ? target.items : [];
  return {
    ...normalizeMealRecordItem(target),
    items: items
      .map((item) => normalizeMealItem(item))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
  } satisfies DietApi.MealRecordDetail;
}

export async function getMealItemDetailApi(itemId: string) {
  const response = await requestClient.get<unknown>(
    `/admin/meal-items/${encodeURIComponent(itemId)}`,
  );
  return normalizeMealItem(response);
}

export async function getDietRecognitionLogListApi(params?: {
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  const response = await requestClient.get<unknown>('/admin/recognition-logs', { params });
  const paged = normalizeAdminPaged(response);
  return {
    items: paged.items.map((item) => normalizeRecognitionLogItem(item)),
    total: paged.total,
  } satisfies PagedResult<DietApi.RecognitionLogItem>;
}

export async function getDietRecognitionLogDetailApi(id: string) {
  const response = await requestClient.get<unknown>(
    `/admin/recognition-logs/${encodeURIComponent(id)}`,
  );
  return normalizeRecognitionLogDetail(response);
}

function normalizeInternalFoodItem(payload: unknown): DietApi.InternalFoodItem {
  const item = pickObject(payload);
  return {
    id: pickString(item.id),
    name: pickString(item.name),
    brand: pickString(item.brand) || null,
    countryCode: pickString(item.countryCode) || null,
    source: pickString(item.source) || null,
    sourceRefId: pickString(item.sourceRefId) || null,
    status: pickString(item.status),
    caloriesPer100g: pickNumber(item.caloriesPer100g),
    proteinPer100g: pickNumber(item.proteinPer100g),
    fatPer100g: pickNumber(item.fatPer100g),
    carbsPer100g: pickNumber(item.carbsPer100g),
    servingSize: pickNumber(item.servingSize) || 100,
    servingUnit: pickString(item.servingUnit) || 'g',
    createdAt: pickString(item.createdAt) || null,
    updatedAt: pickString(item.updatedAt) || null,
  };
}

function normalizeUserCommonFoodItem(payload: unknown): DietApi.UserCommonFoodItem {
  const item = pickObject(payload);
  const userId = pickString(item.userId);
  const normalizedName = pickString(item.normalizedName);
  return {
    userId,
    foodName: pickString(item.foodName),
    canonicalName: pickString(item.canonicalName),
    normalizedName,
    foodId: pickString(item.foodId) || null,
    usageCount: pickNumber(item.usageCount),
    defaultWeightGram: pickNumber(item.defaultWeightGram),
    caloriesPer100g: pickNumber(item.caloriesPer100g),
    proteinPer100g: pickNumber(item.proteinPer100g),
    fatPer100g: pickNumber(item.fatPer100g),
    carbsPer100g: pickNumber(item.carbsPer100g),
    lastUsedAt: pickString(item.lastUsedAt) || null,
    source: pickString(item.source) || 'user_common',
    rowKey: `${userId}::${normalizedName}`,
  };
}

export async function getInternalFoodListApi(params?: {
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  const response = await requestClient.get<unknown>('/admin/foods', { params });
  const paged = normalizeAdminPaged(response);
  return {
    items: paged.items.map((item) => normalizeInternalFoodItem(item)),
    total: paged.total,
  } satisfies PagedResult<DietApi.InternalFoodItem>;
}

export async function getInternalFoodDetailApi(id: string) {
  const response = await requestClient.get<unknown>(
    `/admin/foods/${encodeURIComponent(id)}`,
  );
  return normalizeInternalFoodItem(response);
}

export async function getUserCommonFoodListApi(params?: {
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  const response = await requestClient.get<unknown>('/admin/user-common-foods', { params });
  const paged = normalizeAdminPaged(response);
  return {
    items: paged.items.map((item) => normalizeUserCommonFoodItem(item)),
    total: paged.total,
  } satisfies PagedResult<DietApi.UserCommonFoodItem>;
}
