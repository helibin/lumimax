import assert from 'node:assert/strict';
import test from 'node:test';
import { IotIngestService } from '../src/iot/pipeline/iot-ingest.service';
import { BizIotTopicKind } from '../src/iot/iot.types';
import { IotDownlinkService } from '../src/iot/transport/iot-downlink.service';
import { TopicParserService } from '../src/iot/pipeline/topic-parser.service';

test('iot downlink persists outbound message', async () => {
  const saved: Array<Record<string, unknown>> = [];
  const repository = {
    async findOne({ where }: { where?: Record<string, unknown> }) {
      return saved.find((item) => item.id === where?.id || item.messageKey === where?.messageKey) ?? null;
    },
    create(input: Record<string, unknown>) {
      return input;
    },
    async save(input: Record<string, unknown>) {
      if (!input.id) {
        input.id = `msg-${saved.length + 1}`;
      }
      const index = saved.findIndex((item) => item.id === input.id);
      if (index >= 0) {
        saved[index] = input;
      } else {
        saved.push(input);
      }
      return input;
    },
  };
  const service = new IotDownlinkService(
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
  assert.equal(result.delivery, 'sent');
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
          delivery: 'sent',
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
          delivery: 'sent',
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

test('iot ingest does not force direct downlink transport for emqx responses', async () => {
  const published: Array<Record<string, unknown>> = [];
  const service = new IotIngestService(
    {
      debug() {},
      warn() {},
    } as never,
    {
      normalize() {
        return {
          vendor: 'emqx',
          topic: 'v1/connect/01habcdefghjkmnpqrstvwxyz0/req',
          deviceId: '01habcdefghjkmnpqrstvwxyz0',
          topicKind: BizIotTopicKind.CONNECT_REQ,
          requestId: '01h0000000000000000000555',
          event: 'connect.register',
          locale: 'zh-CN',
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
          requestId: '01h0000000000000000000555',
          downlink: {
            topicKind: BizIotTopicKind.CONNECT_RES,
            event: 'connect.register.result',
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
          topic: 'v1/connect/01habcdefghjkmnpqrstvwxyz0/res',
          requestId: '01h0000000000000000000555',
          delivery: 'queued',
        };
      },
    } as never,
  );

  await service.ingestCloudMessage({
    vendor: 'emqx',
    topic: 'v1/connect/01habcdefghjkmnpqrstvwxyz0/req',
    payload: {},
  });

  assert.equal(published.length, 1);
  assert.equal(published[0].vendor, 'emqx');
  assert.equal('transport' in published[0], false);
  assert.equal((published[0].payload as any).meta.event, 'connect.register.result');
});
