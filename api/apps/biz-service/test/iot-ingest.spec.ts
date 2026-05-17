import assert from 'node:assert/strict';
import test from 'node:test';
import { BizIotTopicKind } from '../src/iot/iot.types';
import { IotIngestService } from '../src/iot/pipeline/iot-ingest.service';

test('ingest logs raw IoT message payload', async () => {
  const debugLogs: Array<{ message: string; meta: Record<string, unknown> }> = [];
  const service = new IotIngestService(
    {
      debug(message: string, meta: Record<string, unknown>) {
        debugLogs.push({ message, meta });
      },
      warn() {},
    } as never,
    {
      normalize(input: Record<string, unknown>) {
        const payload = input.payload as Record<string, unknown>;
        return {
          vendor: input.vendor,
          topic: input.topic,
          deviceId: 'device-raw-001',
          topicKind: BizIotTopicKind.EVENT_REQ,
          requestId: 'req-raw-1',
          event: 'meal.record.create',
          locale: 'zh-CN',
          payload,
          timestamp: 1710000000000,
          receivedAt: new Date('2026-05-01T00:00:00.000Z'),
        };
      },
    } as never,
    {
      async dispatch() {
        return {
          accepted: true,
          requestId: 'req-raw-1',
        };
      },
    } as never,
    {
      async recordReceived() {
        return {
          duplicate: false,
          entity: {
            status: 'received',
          },
        };
      },
      async markFailed() {},
      async markHandled() {},
    } as never,
    {
      async publish() {
        throw new Error('publish should not be called');
      },
    } as never,
  );

  await service.ingestCloudMessage({
    vendor: 'emqx',
    topic: 'v1/event/device-raw-001/req',
    payload: {
      meta: {
        requestId: 'req-raw-1',
        deviceId: 'device-raw-001',
        event: 'meal.record.create',
      },
      data: {
        mealRecordId: 'meal-raw-1',
      },
    },
  });

  const rawLog = debugLogs.find((item) => item.message === '收到 IoT 原始消息');
  assert.ok(rawLog);
  const rawMessage = rawLog.meta.rawMessage as Record<string, unknown>;
  assert.equal(rawMessage.vendor, 'emqx');
  assert.equal(rawMessage.topic, 'v1/event/device-raw-001/req');
  const payload = rawMessage.payload as Record<string, unknown>;
  const data = payload.data as Record<string, unknown>;
  assert.equal(data.mealRecordId, 'meal-raw-1');
});

test('connect.register failure publishes connect result topic', async () => {
  const published: Array<Record<string, unknown>> = [];
  const service = new IotIngestService(
    {
      debug() {},
      warn() {},
    } as never,
    {
      normalize() {
        return {
          vendor: 'aws',
          topic: 'v1/connect/01habcdefghjkmnpqrstvwxyz0/req',
          deviceId: '01habcdefghjkmnpqrstvwxyz0',
          topicKind: BizIotTopicKind.CONNECT_REQ,
          requestId: '01h0000000000000000000101',
          event: 'connect.register',
          locale: 'zh-CN',
          payload: {},
          timestamp: Date.now(),
          receivedAt: new Date('2026-05-01T00:00:00.000Z'),
        };
      },
    } as never,
    {
      async dispatch() {
        throw new Error('invalid payload');
      },
    } as never,
    {
      async isHandled() {
        return false;
      },
      async recordReceived() {
        return {
          duplicate: false,
          entity: {
            status: 'received',
          },
        };
      },
      async markFailed() {},
      async markHandled() {},
    } as never,
    {
      async publish(input: Record<string, unknown>) {
        published.push(input);
        return {
          topic: 'v1/connect/01habcdefghjkmnpqrstvwxyz0/res',
          requestId: '01h0000000000000000000101',
          published: true,
        };
      },
    } as never,
  );

  const result = await service.ingestCloudMessage({
    vendor: 'aws',
    topic: 'v1/connect/01habcdefghjkmnpqrstvwxyz0/req',
    payload: {},
  });

  assert.equal(published.length, 1);
  assert.equal(published[0]?.topicKind, BizIotTopicKind.CONNECT_RES);
  const payload = (published[0]?.payload ?? {}) as Record<string, unknown>;
  const meta = (payload.meta ?? {}) as Record<string, unknown>;
  assert.equal(meta.event, 'connect.register.result');
  assert.equal(meta.locale, 'zh-CN');
  assert.equal(result.success, false);
  assert.equal(result.message, 'invalid payload');
  assert.equal(result.normalized.locale, 'zh-CN');
});

test('food.analysis.confirm.request failure publishes confirm result topic', async () => {
  const published: Array<Record<string, unknown>> = [];
  const service = new IotIngestService(
    {
      debug() {},
      warn() {},
    } as never,
    {
      normalize() {
        return {
          vendor: 'aws',
          topic: 'v1/event/device-009/req',
          deviceId: 'device-009',
          topicKind: BizIotTopicKind.EVENT_REQ,
          requestId: '01h0000000000000000000199',
          event: 'food.analysis.confirm.request',
          locale: 'zh-CN',
          payload: {
            mealRecordId: '01hmeal000000000000000099',
            foodItemId: '01hitem000000000000000099',
          },
          timestamp: Date.now(),
          receivedAt: new Date('2026-05-01T00:00:00.000Z'),
        };
      },
    } as never,
    {
      async dispatch() {
        throw new Error('meal confirm requires selectedFoodName');
      },
    } as never,
    {
      async isHandled() {
        return false;
      },
      async recordReceived() {
        return {
          duplicate: false,
          entity: {
            status: 'received',
          },
        };
      },
      async markFailed() {},
      async markHandled() {},
    } as never,
    {
      async publish(input: Record<string, unknown>) {
        published.push(input);
        return {
          topic: 'v1/event/device-009/res',
          requestId: '01h0000000000000000000199',
          published: true,
        };
      },
    } as never,
  );

  const result = await service.ingestCloudMessage({
    vendor: 'aws',
    topic: 'v1/event/device-009/req',
    payload: {},
  });

  assert.equal(published.length, 1);
  assert.equal(published[0]?.topicKind, BizIotTopicKind.EVENT_RES);
  const payload = (published[0]?.payload ?? {}) as Record<string, unknown>;
  const meta = (payload.meta ?? {}) as Record<string, unknown>;
  const data = (payload.data ?? {}) as Record<string, unknown>;
  assert.equal(meta.event, 'food.analysis.confirm.result');
  assert.equal(meta.locale, 'zh-CN');
  assert.equal(data.errorCode, 'food_analysis_confirm_failed');
  assert.equal(result.success, false);
  assert.equal(result.message, 'meal confirm requires selectedFoodName');
});

test('upload.url.request failure publishes upload.url.result topic', async () => {
  const published: Array<Record<string, unknown>> = [];
  const service = new IotIngestService(
    {
      debug() {},
      warn() {},
    } as never,
    {
      normalize() {
        return {
          vendor: 'aws',
          topic: 'v1/event/device-url-001/req',
          deviceId: 'device-url-001',
          topicKind: BizIotTopicKind.EVENT_REQ,
          requestId: '01h0000000000000000000888',
          event: 'upload.url.request',
          locale: 'zh-CN',
          payload: {},
          timestamp: Date.now(),
          receivedAt: new Date('2026-05-01T00:00:00.000Z'),
        };
      },
    } as never,
    {
      async dispatch() {
        throw new Error('S3 unavailable');
      },
    } as never,
    {
      async isHandled() {
        return false;
      },
      async recordReceived() {
        return {
          duplicate: false,
          entity: {
            status: 'received',
          },
        };
      },
      async markFailed() {},
      async markHandled() {},
    } as never,
    {
      async publish(input: Record<string, unknown>) {
        published.push(input);
        return {
          topic: 'v1/event/device-url-001/res',
          requestId: '01h0000000000000000000888',
          published: true,
        };
      },
    } as never,
  );

  const result = await service.ingestCloudMessage({
    vendor: 'aws',
    topic: 'v1/event/device-url-001/req',
    payload: {},
  });

  assert.equal(published.length, 1);
  assert.equal(published[0]?.topicKind, BizIotTopicKind.EVENT_RES);
  const payload = (published[0]?.payload ?? {}) as Record<string, unknown>;
  const meta = (payload.meta ?? {}) as Record<string, unknown>;
  const data = (payload.data ?? {}) as Record<string, unknown>;
  assert.equal(meta.event, 'upload.url.result');
  assert.equal(data.errorCode, 'upload_url_failed');
  assert.equal(result.success, false);
  assert.equal(result.message, 'S3 unavailable');
});

test('normalized ingest skips duplicate business delivery before dispatch', async () => {
  let dispatched = false;
  const service = new IotIngestService(
    {
      debug() {},
      warn() {},
    } as never,
    {
      normalize() {
        throw new Error('normalize should not be called for normalized ingest');
      },
    } as never,
    {
      async dispatch() {
        dispatched = true;
        return { accepted: true };
      },
    } as never,
    {
      async claimHandling() {
        return { claimed: false, status: 'processing' };
      },
      async recordReceived() {
        throw new Error('recordReceived should not be called for normalized ingest');
      },
      async markFailed() {},
      async markHandled() {},
    } as never,
    {
      async publish() {
        throw new Error('publish should not be called for duplicate delivery');
      },
    } as never,
  );

  const result = await service.ingestNormalizedMessage({
    vendor: 'emqx',
    topic: 'emqx/client.connected/device-001',
    deviceId: 'device-001',
    topicKind: BizIotTopicKind.STATUS_REQ,
    requestId: 'emqx:connected:device-001:1',
    event: 'client.connected',
    locale: 'en-US',
    payload: { event: 'client.connected' },
    timestamp: Date.now(),
    receivedAt: new Date('2026-05-01T00:00:00.000Z'),
  });

  assert.equal(dispatched, false);
  assert.equal(result.success, true);
  assert.equal((result.result as Record<string, unknown>).duplicate, true);
});
