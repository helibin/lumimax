import assert from 'node:assert/strict';
import test from 'node:test';
import { BizIotTopicKind } from '../src/iot/iot.types';
import { IotIngestService } from '../src/iot/events/iot-ingest.service';

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
  assert.equal(data.errorCode, 'food_analysis_confirm_invalid_request');
  assert.equal(result.success, false);
  assert.equal(result.message, 'meal confirm requires selectedFoodName');
});
