import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeIotWebhookBody } from './gateway-iot-webhook.util';

test('normalizeIotWebhookBody supports aws http payloads', () => {
  const normalized = normalizeIotWebhookBody('aws', {
    topic: 'v1/event/device-001/req',
    payload: {
      meta: {
        requestId: 'req-aws-http-1',
      },
      data: {
        ok: true,
      },
    },
    timestamp: 1730000000000,
  });

  assert.equal(normalized.topic, 'v1/event/device-001/req');
  assert.deepEqual(normalized.payload, {
    meta: {
      requestId: 'req-aws-http-1',
    },
    data: {
      ok: true,
    },
  });
  assert.equal(normalized.receivedAt, 1730000000000);
});

test('normalizeIotWebhookBody supports emqx webhook payloads', () => {
  const normalized = normalizeIotWebhookBody('emqx', {
    event: 'connected',
    clientid: 'device-001',
    payload: {
      meta: {
        requestId: 'req-emqx-http-1',
      },
      data: {
        source: 'emqx',
      },
    },
    connected_at: 1730000001000,
  });

  assert.equal(normalized.topic, 'emqx/connected/device-001');
  assert.deepEqual(normalized.payload, {
    meta: {
      requestId: 'req-emqx-http-1',
    },
    data: {
      source: 'emqx',
    },
    event: 'connected',
    clientid: 'device-001',
    timestamp: 1730000001000,
  });
  assert.equal(normalized.receivedAt, 1730000001000);
});

test('normalizeIotWebhookBody rejects unknown vendor', () => {
  assert.throws(
    () =>
      normalizeIotWebhookBody('unknown-vendor', {
        topic: 'v1/event/device-001/req',
        payload: {},
      }),
    /unsupported iot vendor/i,
  );
});
