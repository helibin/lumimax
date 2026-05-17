import assert from 'node:assert/strict';
import test from 'node:test';
import { IotNormalizerService } from '../src/iot/pipeline/iot-normalizer.service';

test('normalizes AWS lifecycle presence topic into status event', () => {
  process.env.DEFAULT_LOCALE = 'en-US';
  const service = new IotNormalizerService(
    {
      parse() {
        throw new Error('not a protocol topic');
      },
    } as never,
    {
      validate() {
        throw new Error('not an envelope payload');
      },
    } as never,
  );

  const result = service.normalize({
    vendor: 'aws',
    topic: '$aws/events/presence/disconnected/device-123',
    payload: {
      clientId: 'device-123',
      timestamp: 1710000000000,
    },
  });

  assert.equal(result.deviceId, 'device-123');
  assert.equal(result.event, 'status.disconnected');
  assert.equal(result.topicKind, 'status.req');
  assert.equal(result.requestId, 'aws:disconnected:device-123:1710000000000');
  assert.equal(result.locale, 'en-US');
});

test('normalizes EMQX lifecycle payload into status event', () => {
  process.env.DEFAULT_LOCALE = 'zh-CN';
  const service = new IotNormalizerService(
    {
      parse() {
        throw new Error('not a protocol topic');
      },
    } as never,
    {
      validate() {
        throw new Error('not an envelope payload');
      },
    } as never,
  );

  const result = service.normalize({
    vendor: 'emqx',
    topic: '$events/client_connected/device-789',
    payload: {
      event: 'client.connected',
      clientid: 'device-789',
      connected_at: 1710000002000,
    },
  });

  assert.equal(result.deviceId, 'device-789');
  assert.equal(result.event, 'status.connected');
  assert.equal(result.topicKind, 'status.req');
  assert.equal(result.requestId, 'emqx:connected:device-789:1710000002000');
  assert.equal(result.locale, 'zh-CN');
});

test('normalizes protocol locale from payload meta', () => {
  const service = new IotNormalizerService(
    {
      parse() {
        return {
          version: 'v1',
          category: 'event',
          deviceId: 'device-123',
          direction: 'req',
          kind: 'event.req',
        };
      },
    } as never,
    {
      validate() {
        return {
          meta: {
            requestId: '01h0000000000000000000002',
            deviceId: 'device-123',
            timestamp: 1710000000000,
            event: 'upload.token.request',
            version: '1.0',
            locale: 'en-US',
          },
          data: {},
        };
      },
    } as never,
  );

  const result = service.normalize({
    vendor: 'aws',
    topic: 'v1/event/device-123/req',
    payload: {},
  });

  assert.equal(result.locale, 'en-US');
});

test('rejects mismatched event for protocol topic kind', () => {
  const service = new IotNormalizerService(
    {
      parse() {
        return {
          version: 'v1',
          category: 'connect',
          deviceId: 'device-123',
          direction: 'req',
          kind: 'connect.req',
        };
      },
    } as never,
    {
      validate() {
        return {
          meta: {
            requestId: '01h0000000000000000000001',
            deviceId: 'device-123',
            timestamp: 1710000000000,
            event: 'upload.token.request',
            version: '1.0',
            locale: 'zh-CN',
          },
          data: {},
        };
      },
    } as never,
  );

  assert.throws(
    () =>
      service.normalize({
        vendor: 'aws',
        topic: 'v1/connect/device-123/req',
        payload: {},
      }),
    /event upload\.token\.request 与 topic 类型 connect\.req 不匹配/,
  );
});
