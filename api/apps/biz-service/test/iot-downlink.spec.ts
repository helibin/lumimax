import assert from 'node:assert/strict';
import test from 'node:test';
import { IotIngestService } from '../src/iot/events/iot-ingest.service';
import { BizIotTopicKind } from '../src/iot/iot.types';
import { IotDownlinkService } from '../src/iot/providers/aws/iot-downlink.service';
import { TopicParserService } from '../src/iot/events/topic-parser.service';

test('iot downlink persists outbound message', async () => {
  const saved: Array<Record<string, unknown>> = [];
  const repository = {
    create(input: Record<string, unknown>) {
      return input;
    },
    async save(input: Record<string, unknown>) {
      saved.push(input);
      return input;
    },
  };
  const service = new IotDownlinkService(
    {
      debug() {},
      warn() {},
    } as never,
    repository as never,
    { findOne: async () => null } as never,
    new TopicParserService(),
  );
  const result = await service.publish({
    vendor: 'aws',
    deviceId: '01habcdefghjkmnpqrstvwxyz0',
    topicKind: BizIotTopicKind.EVENT_RES,
    requestId: '01h0000000000000000000101',
    payload: {
      meta: {
        requestId: '01h0000000000000000000101',
        deviceId: '01habcdefghjkmnpqrstvwxyz0',
        timestamp: Date.now(),
        event: 'food.analysis.result',
        version: '1.0',
        locale: 'zh-CN',
      },
      data: { ok: true },
    },
  });
  assert.equal(result.topic, 'v1/event/01habcdefghjkmnpqrstvwxyz0/res');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].direction, 'downstream');
  assert.match(String(saved[0].messageKey ?? ''), /^01h0000000000000000000101:[0-9a-f]{16}$/);
  assert.ok(String(saved[0].messageKey ?? '').length <= 64);
});

test('iot ingest publishes downlink returned by dispatcher', async () => {
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
          topic: 'v1/event/01habcdefghjkmnpqrstvwxyz0/req',
          deviceId: '01habcdefghjkmnpqrstvwxyz0',
          topicKind: 'event.req',
          requestId: '01h0000000000000000000101',
          event: 'upload.token.request',
          locale: 'zh-CN',
          lang: 'zh-CN',
          payload: {},
          timestamp: Date.now(),
          receivedAt: new Date(),
        };
      },
    } as never,
    {
      async dispatch() {
        return {
          accepted: true,
          requestId: '01h0000000000000000000101',
          downlink: {
            topicKind: BizIotTopicKind.EVENT_RES,
            event: 'upload.token.result',
            data: { code: 0, msg: 'ok' },
            qos: 1,
          },
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
      async markHandled() {
        return;
      },
      async markFailed() {
        return;
      },
    } as never,
    {
      async publish(input: Record<string, unknown>) {
        published.push(input);
        return {
          topic: 'v1/event/01habcdefghjkmnpqrstvwxyz0/res',
          requestId: '01h0000000000000000000101',
          published: true,
        };
      },
    } as never,
  );

  await service.ingestCloudMessage({
    vendor: 'aws',
    topic: 'v1/event/01habcdefghjkmnpqrstvwxyz0/req',
    payload: {},
  });

  assert.equal(published.length, 1);
  assert.equal(published[0].deviceId, '01habcdefghjkmnpqrstvwxyz0');
  assert.equal(published[0].topicKind, BizIotTopicKind.EVENT_RES);
  assert.equal((published[0].payload as any).meta.event, 'upload.token.result');
  assert.equal((published[0].payload as any).meta.locale, 'zh-CN');
});

test('iot ingest publishes failure downlink when dispatcher throws', async () => {
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
          topic: 'v1/event/01habcdefghjkmnpqrstvwxyz0/req',
          deviceId: '01habcdefghjkmnpqrstvwxyz0',
          topicKind: 'event.req',
          requestId: '01h0000000000000000000102',
          event: 'food.analysis.request',
          locale: 'en-US',
          lang: 'en-US',
          payload: {},
          timestamp: Date.now(),
          receivedAt: new Date(),
        };
      },
    } as never,
    {
      async dispatch() {
        throw new Error('object missing: tmp-file/device/01habcdefghjkmnpqrstvwxyz0/demo.png');
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
      async markHandled() {
        return;
      },
      async markFailed() {
        return;
      },
    } as never,
    {
      async publish(input: Record<string, unknown>) {
        published.push(input);
        return {
          topic: 'v1/event/01habcdefghjkmnpqrstvwxyz0/res',
          requestId: '01h0000000000000000000102',
          published: true,
        };
      },
    } as never,
  );

  const result = await service.ingestCloudMessage({
    vendor: 'aws',
    topic: 'v1/event/01habcdefghjkmnpqrstvwxyz0/req',
    payload: {},
  });

  assert.equal(published.length, 1);
  assert.equal((published[0].payload as any).meta.event, 'food.analysis.result');
  assert.equal((published[0].payload as any).meta.locale, 'en-US');
  assert.equal((published[0].payload as any).data.errorCode, 'food_analysis_failed');
  assert.equal(result.success, false);
  assert.equal(result.message, 'object missing: tmp-file/device/01habcdefghjkmnpqrstvwxyz0/demo.png');
});

test('aliyun downlink topic uses device id instead of device sn', async () => {
  const previousFetch = global.fetch;
  const requests: Array<{ body: string }> = [];
  const service = new IotDownlinkService(
    {
      debug() {},
      warn() {},
    } as never,
    {
      create(input: Record<string, unknown>) {
        return input;
      },
      async save(input: Record<string, unknown>) {
        return input;
      },
    } as never,
    {
      async findOne() {
        return {
          id: 'device-id-9001',
          deviceSn: 'sn-legacy-9001',
          productKey: 'pk-9001',
          tenantId: 'tenant-1',
        };
      },
    } as never,
    new TopicParserService(),
  );

  process.env.CLOUD_REGION = 'cn-shanghai';
  process.env.CLOUD_ACCESS_KEY_ID = 'test-ak';
  process.env.CLOUD_ACCESS_KEY_SECRET = 'test-sk';
  process.env.IOT_ENDPOINT = 'https://iot.cn-shanghai.aliyuncs.com';

  global.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    requests.push({ body: String(init?.body ?? '') });
    return {
      ok: true,
      text: async () => '{"Success":true}',
    } as Response;
  }) as typeof fetch;

  try {
    const result = await service.publish({
      vendor: 'aliyun',
      deviceId: 'device-id-9001',
      topicKind: BizIotTopicKind.EVENT_RES,
      requestId: '01h0000000000000000000999',
      payload: {
        meta: {
          requestId: '01h0000000000000000000999',
          deviceId: 'device-id-9001',
          timestamp: Date.now(),
          event: 'ota.result',
          version: '1.0',
          locale: 'zh-CN',
        },
        data: { ok: true },
      },
    });

    assert.equal(result.published, true);
    assert.equal(requests.length, 1);
    const body = requests[0].body;
    assert.match(body, /TopicFullName=%2Fpk-9001%2Fdevice-id-9001%2Fuser%2Fv1%2Fevent%2Fdevice-id-9001%2Fres/);
    assert.doesNotMatch(body, /sn-legacy-9001/);
  } finally {
    global.fetch = previousFetch;
  }
});
