import assert from 'node:assert/strict';
import test from 'node:test';
import { IotDispatcherService } from '../src/iot/pipeline/iot-dispatcher.service';
import { BizIotTopicKind } from '../src/iot/iot.types';

test('upload token request forces sts credentials mode and returns upload.token.result', async () => {
  let capturedBody: Record<string, unknown> | null = null;
  const service = new IotDispatcherService(
    {} as never,
    {} as never,
    {
      async execute(input: { body: Record<string, unknown> }) {
        capturedBody = input.body;
        return {
          provider: 'aws',
          mode: 'credentials',
          uploadMode: 'sts_credentials',
          bucket: 'bucket-name',
          region: 'ap-southeast-1',
          objectKey: 'tmp-file/device/01habcdefghjkmnpqrstvwxyz0/demo.png',
          tmpPrefix: 'tmp-file/device/01habcdefghjkmnpqrstvwxyz0/',
          credentials: {
            accessKeyId: 'ASIADEMO',
            secretAccessKey: 'secret',
            sessionToken: 'token',
          },
          expiresAt: 1710003800000,
          maxFileSize: 5242880,
        };
      },
    } as never,
  );

  const result = await service.dispatch({
    vendor: 'aws',
    topic: 'v1/event/01habcdefghjkmnpqrstvwxyz0/req',
    topicKind: BizIotTopicKind.EVENT_REQ,
    deviceId: '01habcdefghjkmnpqrstvwxyz0',
    requestId: '01h0000000000000000000101',
    event: 'upload.token.request',
    locale: 'zh-CN',
    payload: {
      filename: 'demo.png',
    },
    timestamp: Date.now(),
    receivedAt: new Date('2026-05-01T00:00:00.000Z'),
  });

  assert.equal((capturedBody as Record<string, unknown> | null)?.['mode'], 'credentials');
  assert.equal(result.downlink?.event, 'upload.token.result');
  assert.deepEqual(result.downlink?.data, {
    code: 0,
    msg: 'ok',
    provider: 'aws',
    mode: 'credentials',
    uploadMode: 'sts_credentials',
    bucket: 'bucket-name',
    region: 'ap-southeast-1',
    objectKey: 'tmp-file/device/01habcdefghjkmnpqrstvwxyz0/demo.png',
    tmpPrefix: 'tmp-file/device/01habcdefghjkmnpqrstvwxyz0/',
    credentials: {
      accessKeyId: 'ASIADEMO',
      secretAccessKey: 'secret',
      sessionToken: 'token',
    },
    expiresAt: 1710003800000,
    maxBytes: 5242880,
  });
  const data = result.downlink?.data as Record<string, unknown>;
  assert.equal('uploadUrl' in data, false);
  assert.equal('method' in data, false);
  assert.equal('headers' in data, false);
});

test('upload url request forces presigned-url mode and returns upload.url.result', async () => {
  let capturedBody: Record<string, unknown> | null = null;
  const service = new IotDispatcherService(
    {} as never,
    {} as never,
    {
      async execute(input: { body: Record<string, unknown> }) {
        capturedBody = input.body;
        return {
          provider: 'aws',
          mode: 'presigned-url',
          uploadMode: 'presigned_put',
          bucket: 'bucket-name',
          region: 'ap-southeast-1',
          objectKey: 'tmp-file/device/device-001/upload_01h0000000000000000000999.jpg',
          uploadUrl: 'https://bucket-name.s3.ap-southeast-1.amazonaws.com/tmp-file/device/device-001/upload_01h0000000000000000000999.jpg?X-Amz-Signature=demo',
          method: 'PUT',
          headers: {
            'Content-Type': 'image/jpeg',
          },
          expiresAt: 1710003800000,
          maxFileSize: 1048576,
        };
      },
    } as never,
  );

  const result = await service.dispatch({
    vendor: 'aws',
    topic: 'v1/event/device-001/req',
    topicKind: BizIotTopicKind.EVENT_REQ,
    deviceId: 'device-001',
    requestId: '01h0000000000000000000999',
    event: 'upload.url.request',
    locale: 'zh-CN',
    payload: {
      fileType: 'image/jpeg',
    },
    timestamp: Date.now(),
    receivedAt: new Date('2026-05-01T00:00:00.000Z'),
  });

  assert.deepEqual(capturedBody, {
    deviceId: 'device-001',
    filename: undefined,
    maxFileSize: undefined,
    allowedMimeTypes: ['image/jpeg'],
    mode: 'presigned-url',
  });
  assert.equal(result.downlink?.event, 'upload.url.result');
  assert.equal(result.handledBy, 'upload.url.request');
  assert.equal((result.downlink?.data as Record<string, unknown>)?.uploadUrl?.toString().includes('X-Amz-Signature'), true);
});

test('upload token request supports fileType and defaults to maxBytes semantics', async () => {
  let capturedBody: Record<string, unknown> | null = null;
  const service = new IotDispatcherService(
    {} as never,
    {} as never,
    {
      async execute(input: { body: Record<string, unknown> }) {
        capturedBody = input.body;
        return {
          provider: 'aws',
          mode: 'credentials',
          uploadMode: 'sts_credentials',
          bucket: 'bucket-name',
          region: 'ap-southeast-1',
          objectKey: 'tmp-file/device/device-001/upload_01h0000000000000000000999.jpg',
          tmpPrefix: 'tmp-file/device/device-001/',
          credentials: {
            accessKeyId: 'ASIADEMO',
            secretAccessKey: 'secret',
            sessionToken: 'token',
          },
          expiresAt: 1710003800000,
          maxFileSize: 1048576,
        };
      },
    } as never,
  );

  await service.dispatch({
    vendor: 'aws',
    topic: 'v1/event/device-001/req',
    topicKind: BizIotTopicKind.EVENT_REQ,
    deviceId: 'device-001',
    requestId: '01h0000000000000000000999',
    event: 'upload.token.request',
    locale: 'zh-CN',
    payload: {
      fileType: 'image/jpeg',
    },
    timestamp: Date.now(),
    receivedAt: new Date('2026-05-01T00:00:00.000Z'),
  });

  assert.deepEqual(capturedBody, {
    deviceId: 'device-001',
    filename: undefined,
    maxFileSize: undefined,
    allowedMimeTypes: ['image/jpeg'],
    mode: 'credentials',
  });
});

test('connect.register forwards locale to device activation without trusting client country fields', async () => {
  let capturedBody: Record<string, unknown> | null = null;
  const service = new IotDispatcherService(
    {
      async activateFromCloud(input: Record<string, unknown>) {
        capturedBody = input;
        return {
          id: 'device-cn-001',
          status: 'active',
        };
      },
    } as never,
    {} as never,
    {} as never,
  );

  const result = await service.dispatch({
    vendor: 'aws',
    topic: 'v1/connect/device-cn-001/req',
    topicKind: BizIotTopicKind.CONNECT_REQ,
    deviceId: 'device-cn-001',
    requestId: '01h0000000000000000000100',
    event: 'connect.register',
    locale: 'en-US',
    payload: {
      locale: 'zh-CN',
      firmwareVersion: '1.2.3',
      hardwareVersion: 'A1',
      protocolVersion: '1.0',
    },
    timestamp: Date.now(),
    receivedAt: new Date('2026-05-01T00:00:00.000Z'),
  });

  assert.deepEqual(capturedBody, {
    vendor: 'aws',
    providerDeviceId: 'device-cn-001',
    activatedAt: '2026-05-01T00:00:00.000Z',
    locale: 'zh-CN',
    firmwareVersion: '1.2.3',
    hardwareVersion: 'A1',
    protocolVersion: '1.0',
    networkStatus: undefined,
    network: undefined,
    source: 'device_connect_register',
  });
  assert.equal(result.downlink?.event, 'connect.register.result');
  assert.equal(result.downlink?.data?.deviceId, 'device-cn-001');
});

test('status topic only accepts status.heartbeat event', async () => {
  const service = new IotDispatcherService(
    {
      async execute() {
        return {};
      },
    } as never,
    {} as never,
    {} as never,
  );

  const result = await service.dispatch({
    vendor: 'aws',
    topic: 'v1/status/01habcdefghjkmnpqrstvwxyz0/req',
    topicKind: BizIotTopicKind.STATUS_REQ,
    deviceId: '01habcdefghjkmnpqrstvwxyz0',
    requestId: '01h0000000000000000000102',
    event: 'connect.register',
    locale: 'zh-CN',
    payload: {},
    timestamp: Date.now(),
    receivedAt: new Date('2026-05-01T00:00:00.000Z'),
  });

  assert.equal(result.accepted, true);
  assert.equal(result.skipped, true);
  assert.match(String(result.reason ?? ''), /status event recorded only/);
});

test('status.disconnected is skipped when no dedicated lifecycle handler exists', async () => {
  const service = new IotDispatcherService(
    {
      async execute() {
        return { ok: true };
      },
    } as never,
    {} as never,
    {} as never,
  );

  const result = await service.dispatch({
    vendor: 'aws',
    topic: '$aws/events/presence/disconnected/device-123',
    topicKind: BizIotTopicKind.STATUS_REQ,
    deviceId: 'device-123',
    requestId: 'aws:disconnected:device-123:1710000000000',
    event: 'status.disconnected',
    locale: 'zh-CN',
    payload: {},
    timestamp: Date.now(),
    receivedAt: new Date('2026-05-01T00:00:00.000Z'),
  });

  assert.equal(result.accepted, true);
  assert.equal(result.skipped, true);
  assert.match(String(result.reason ?? ''), /status event recorded only/);
});

test('nutrition analysis result only exposes mealRecordId', async () => {
  const service = new IotDispatcherService(
    {} as never,
    {
      async finishMealRecord() {
        return {
          mealRecordId: '01h0000000000000000000201',
          status: 'finished',
          total: { itemCount: 2, calories: 560 },
          items: [],
          finishedAt: '2026-05-01T00:00:05.000Z',
        };
      },
    } as never,
    {} as never,
  );

  const result = await service.dispatch({
    vendor: 'aws',
    topic: 'v1/event/01habcdefghjkmnpqrstvwxyz0/req',
    topicKind: BizIotTopicKind.EVENT_REQ,
    deviceId: '01habcdefghjkmnpqrstvwxyz0',
    requestId: '01h0000000000000000000103',
    event: 'nutrition.analysis.request',
    locale: 'zh-CN',
    payload: {
      mealRecordId: '01h0000000000000000000201',
    },
    timestamp: Date.now(),
    receivedAt: new Date('2026-05-01T00:00:00.000Z'),
  });

  assert.equal(result.downlink?.event, 'nutrition.analysis.result');
  assert.equal(result.downlink?.data?.mealRecordId, '01h0000000000000000000201');
  assert.equal('mealId' in (result.downlink?.data ?? {}), false);
});

test('food analysis result uses weight and unit fields', async () => {
  const service = new IotDispatcherService(
    {} as never,
    {
      async analyzeFoodItem() {
        return {
          itemId: '01h0000000000000000000501',
          items: [{
            itemId: '01h0000000000000000000501',
            type: 'ingredient',
            name: 'rice',
            displayName: '米饭',
            canonicalName: 'steamed white rice',
            normalizedName: 'steamed white rice',
            quantity: 1,
            measuredWeightGram: 123.5,
            estimatedWeightGram: 123.5,
            confidence: 0.92,
            source: 'usda_fdc',
            provider: 'usda_fdc',
            verifiedLevel: 'verified',
            calories: 120,
            protein: 2.7,
            fat: 0.3,
            carbs: 25.6,
            children: [],
          }],
          estimatedNutrition: {
            calories: 120,
            protein: 2.7,
            fat: 0.3,
            carbs: 25.6,
            source: 'usda_fdc',
            provider: 'usda_fdc',
            verifiedLevel: 'verified',
          },
          confirmationOptions: [{
            optionId: 'recognized:steamed white rice',
            foodName: 'rice',
            displayName: '米饭',
            canonicalName: 'steamed white rice',
            source: 'recognized',
            provider: 'vision-provider',
            confidence: 0.92,
          }],
          requiresUserConfirmation: false,
          mealTotal: {},
        };
      },
    } as never,
    {} as never,
  );

  const result = await service.dispatch({
    vendor: 'aws',
    topic: 'v1/event/device-001/req',
    topicKind: BizIotTopicKind.EVENT_REQ,
    deviceId: 'device-001',
    requestId: '01h0000000000000000000500',
    event: 'food.analysis.request',
    locale: 'zh-CN',
    payload: {
      mealRecordId: '01h0000000000000000000401',
      imageKey: 'tmp-file/device/device-001/demo.png',
      weight: 123.5,
    },
    timestamp: Date.now(),
    receivedAt: new Date('2026-05-01T00:00:00.000Z'),
  });

  assert.equal(result.downlink?.event, 'food.analysis.result');
  assert.equal(result.downlink?.data?.weight, 123.5);
  assert.equal(result.downlink?.data?.unit, 'g');
  assert.equal('weightValue' in (result.downlink?.data ?? {}), false);
  assert.equal('weightUnit' in (result.downlink?.data ?? {}), false);
  assert.deepEqual(result.downlink?.data?.items, [
    {
      foodId: '01h0000000000000000000501',
      type: 'ingredient',
      name: 'rice',
      displayName: '米饭',
      canonicalName: 'steamed white rice',
      quantity: 1,
      measuredWeightGram: 123.5,
      estimatedWeightGram: 123.5,
      confidence: 0.92,
      source: 'usda_fdc',
      provider: 'usda_fdc',
      verifiedLevel: 'verified',
      calories: 120,
      nutrition: {
        protein: 2.7,
        fat: 0.3,
        carbohydrate: 25.6,
        fiber: 0,
      },
      children: [],
    },
  ]);
  assert.deepEqual(result.downlink?.data?.estimatedNutrition, {
    calories: 120,
    protein: 2.7,
    fat: 0.3,
    carbs: 25.6,
    source: 'usda_fdc',
    provider: 'usda_fdc',
    verifiedLevel: 'verified',
  });
  assert.deepEqual(result.downlink?.data?.confirmationOptions, [{
    optionId: 'recognized:steamed white rice',
    foodName: 'rice',
    displayName: '米饭',
    canonicalName: 'steamed white rice',
    source: 'recognized',
    provider: 'vision-provider',
    confidence: 0.92,
  }]);
  assert.equal(result.downlink?.data?.requiresUserConfirmation, false);
  assert.deepEqual(result.downlink?.data?.userCommonCandidates, []);
  assert.equal('recognitions' in (result.downlink?.data ?? {}), false);
});

test('food analysis falls back to protocol lang when payload locale is absent', async () => {
  let capturedLocale: string | undefined;
  const service = new IotDispatcherService(
    {} as never,
    {
      async analyzeFoodItem(input: { locale?: string }) {
        capturedLocale = input.locale;
        return {
          itemId: '01h0000000000000000000502',
          items: [{
            itemId: '01h0000000000000000000502',
            type: 'ingredient',
            name: 'avocado',
            displayName: 'avocado',
            canonicalName: 'avocado',
            normalizedName: 'avocado',
            quantity: 1,
            measuredWeightGram: 88,
            estimatedWeightGram: 88,
            confidence: 0.81,
            source: 'boohee',
            provider: 'boohee',
            verifiedLevel: 'verified',
            calories: 160,
            protein: 2,
            fat: 15,
            carbs: 9,
            children: [],
          }],
          estimatedNutrition: {
            calories: 160,
            protein: 2,
            fat: 15,
            carbs: 9,
            source: 'boohee',
            provider: 'boohee',
            verifiedLevel: 'verified',
          },
          confirmationOptions: [],
          requiresUserConfirmation: false,
          mealTotal: {},
        };
      },
    } as never,
    {} as never,
  );

  await service.dispatch({
    vendor: 'aws',
    topic: 'v1/event/device-002/req',
    topicKind: BizIotTopicKind.EVENT_REQ,
    deviceId: 'device-002',
    requestId: '01h0000000000000000000503',
    event: 'food.analysis.request',
    locale: 'en-US',
    payload: {
      mealRecordId: '01h0000000000000000000402',
      imageKey: 'tmp-file/device/device-002/demo.png',
      weight: 88,
    },
    timestamp: Date.now(),
    receivedAt: new Date('2026-05-01T00:00:00.000Z'),
  });

  assert.equal(capturedLocale, 'en-US');
});

test('food analysis result ignores legacy single-food payload fallback', async () => {
  const service = new IotDispatcherService(
    {} as never,
    {
      async analyzeFoodItem() {
        return {
          itemId: '01h0000000000000000000601',
          food: {
            name: 'legacy food object should be ignored',
            calories: 999,
          },
          estimatedNutrition: {
            calories: 0,
            protein: 0,
            fat: 0,
            carbs: 0,
            source: 'llm_estimated',
            provider: 'llm_estimator',
            verifiedLevel: 'estimated',
          },
          confirmationOptions: [],
          requiresUserConfirmation: true,
          mealTotal: {},
        };
      },
    } as never,
    {} as never,
  );

  const result = await service.dispatch({
    vendor: 'aws',
    topic: 'v1/event/device-legacy/req',
    topicKind: BizIotTopicKind.EVENT_REQ,
    deviceId: 'device-legacy',
    requestId: '01h0000000000000000000600',
    event: 'food.analysis.request',
    locale: 'zh-CN',
    payload: {
      mealRecordId: '01h0000000000000000000602',
      imageKey: 'tmp-file/device/device-legacy/demo.png',
      weight: 80,
    },
    timestamp: Date.now(),
    receivedAt: new Date('2026-05-01T00:00:00.000Z'),
  });

  assert.deepEqual(result.downlink?.data?.items, []);
  assert.equal('food' in (result.downlink?.data ?? {}), false);
});

test('food analysis confirm request accepts correction aliases and defaults locale from server config', async () => {
  process.env.DEFAULT_LOCALE = 'en-US';
  let capturedInput: Record<string, unknown> | undefined;
  const service = new IotDispatcherService(
    {} as never,
    {
      async confirmFoodItem(input: Record<string, unknown>) {
        capturedInput = input;
        return {
          item: { id: input.itemId },
          mealRecordId: input.mealRecordId,
        };
      },
    } as never,
    {} as never,
  );

  const result = await service.dispatch({
    vendor: 'aws',
    topic: 'v1/event/device-003/req',
    topicKind: BizIotTopicKind.EVENT_REQ,
    deviceId: 'device-003',
    requestId: '01h0000000000000000000504',
    event: 'food.analysis.confirm.request',
    locale: '',
    payload: {
      mealRecordId: '01h0000000000000000000403',
      foodItemId: '01h0000000000000000000504',
      correctedName: '番茄炒蛋',
      correctedWeightGram: 132,
    },
    timestamp: Date.now(),
    receivedAt: new Date('2026-05-01T00:00:00.000Z'),
  });

  assert.deepEqual(capturedInput, {
    mealRecordId: '01h0000000000000000000403',
    itemId: '01h0000000000000000000504',
    userId: 'device-003',
    foodName: '番茄炒蛋',
    selectedFoodId: undefined,
    correctedCount: undefined,
    confirmationSource: undefined,
    weightGram: 132,
    locale: 'en-US',
    market: undefined,
    requestId: '01h0000000000000000000504',
  });
  assert.equal(result.downlink?.event, 'food.analysis.confirm.result');
  assert.deepEqual(result.downlink?.data, {
    code: 0,
    msg: 'ok',
    mealRecordId: '01h0000000000000000000403',
    foodItemId: '01h0000000000000000000504',
    status: 'confirmed',
    confirmationSource: 'recognized',
  });
});

test('food analysis confirm request forwards selected food and confirmation source', async () => {
  let capturedInput: Record<string, unknown> | undefined;
  const service = new IotDispatcherService(
    {} as never,
    {
      async confirmFoodItem(input: Record<string, unknown>) {
        capturedInput = input;
        return {
          item: { id: input.itemId },
          mealRecordId: input.mealRecordId,
          confirmationSource: input.confirmationSource,
        };
      },
    } as never,
    {} as never,
  );

  await service.dispatch({
    vendor: 'aws',
    topic: 'v1/event/device-004/req',
    topicKind: BizIotTopicKind.EVENT_REQ,
    deviceId: 'device-004',
    requestId: '01h0000000000000000000505',
    event: 'food.analysis.confirm.request',
    locale: 'en-US',
    payload: {
      mealRecordId: '01h0000000000000000000404',
      foodItemId: '01h0000000000000000000505',
      selectedFoodId: '01hfood0000000000000000001',
      selectedFoodName: 'rice bowl',
      correctedCount: 2,
      correctedWeightGram: 188,
      confirmationSource: 'user_common_selected',
    },
    timestamp: Date.now(),
    receivedAt: new Date('2026-05-01T00:00:00.000Z'),
  });

  assert.deepEqual(capturedInput, {
    mealRecordId: '01h0000000000000000000404',
    itemId: '01h0000000000000000000505',
    userId: 'device-004',
    foodName: 'rice bowl',
    selectedFoodId: '01hfood0000000000000000001',
    correctedCount: 2,
    confirmationSource: 'user_common_selected',
    weightGram: 188,
    locale: 'en-US',
    market: undefined,
    requestId: '01h0000000000000000000505',
  });
});
