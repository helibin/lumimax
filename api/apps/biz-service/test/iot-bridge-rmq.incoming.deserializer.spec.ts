import assert from 'node:assert/strict';
import test from 'node:test';
import { IotBridgeIncomingDeserializer } from '../src/iot/transport/iot-bridge-rmq.incoming.deserializer';
import {
  IOT_BRIDGE_DOWNSTREAM_PUBLISH_EVENT,
  IOT_BRIDGE_UPSTREAM_EVENT,
  IOT_BRIDGE_UPSTREAM_LIFECYCLE_EVENT,
} from '../src/iot/transport/iot-bridge.rabbitmq';

test('IotBridgeIncomingDeserializer maps flat EMQX-style uplink to Nest pattern + data', () => {
  const d = new IotBridgeIncomingDeserializer();
  const flat = {
    vendor: 'emqx',
    topic: 'v1/event/d1/r1',
    payload: { x: 1 },
    receivedAt: 1,
    requestId: 'r1',
  };
  const out = d.deserialize(flat) as { pattern: string; data: typeof flat };
  assert.equal(out.pattern, IOT_BRIDGE_UPSTREAM_EVENT);
  assert.deepEqual(out.data, flat);
});

test('IotBridgeIncomingDeserializer maps emqx/ lifecycle topic to lifecycle pattern', () => {
  const d = new IotBridgeIncomingDeserializer();
  const flat = {
    vendor: 'emqx',
    topic: 'emqx/client_connected',
    payload: {},
    receivedAt: 2,
    requestId: 'r2',
  };
  const out = d.deserialize(flat) as { pattern: string; data: typeof flat };
  assert.equal(out.pattern, IOT_BRIDGE_UPSTREAM_LIFECYCLE_EVENT);
});

test('IotBridgeIncomingDeserializer maps flat downlink command body', () => {
  const d = new IotBridgeIncomingDeserializer();
  const flat = {
    vendor: 'emqx',
    deviceId: 'd1',
    topic: 'v1/cmd/d1/res',
    payload: {},
    requestId: 'r3',
  };
  const out = d.deserialize(flat) as { pattern: string; data: typeof flat };
  assert.equal(out.pattern, IOT_BRIDGE_DOWNSTREAM_PUBLISH_EVENT);
  assert.deepEqual(out.data, flat);
});

test('IotBridgeIncomingDeserializer leaves native Nest envelope unchanged', () => {
  const d = new IotBridgeIncomingDeserializer();
  const envelope = { pattern: IOT_BRIDGE_UPSTREAM_EVENT, data: { a: 1 } };
  const out = d.deserialize(envelope) as typeof envelope;
  assert.deepEqual(out, envelope);
});

test('IotBridgeIncomingDeserializer unwraps nested RabbitMQ business envelope in Nest packet', () => {
  const d = new IotBridgeIncomingDeserializer();
  const data = {
    vendor: 'emqx',
    topic: 'v1/event/d1/req',
    payload: { ok: true },
    receivedAt: 3,
    requestId: 'r4',
  };
  const envelope = {
    pattern: IOT_BRIDGE_UPSTREAM_EVENT,
    data: {
      eventId: 'evt-1',
      eventName: IOT_BRIDGE_UPSTREAM_EVENT,
      occurredAt: '2026-05-01T00:00:00.000Z',
      source: 'iot-bridge',
      requestId: 'r4',
      data,
    },
  };
  const out = d.deserialize(envelope) as {
    pattern: string;
    data: typeof data;
  };
  assert.equal(out.pattern, IOT_BRIDGE_UPSTREAM_EVENT);
  assert.deepEqual(out.data, data);
});

test('IotBridgeIncomingDeserializer maps RabbitMQ business envelope to Nest pattern + data', () => {
  const d = new IotBridgeIncomingDeserializer();
  const envelope = {
    eventId: 'evt-1',
    eventName: IOT_BRIDGE_UPSTREAM_EVENT,
    occurredAt: '2026-05-01T00:00:00.000Z',
    source: 'iot-bridge',
    requestId: 'r4',
    data: {
      vendor: 'emqx',
      topic: 'v1/event/d1/req',
      payload: { ok: true },
      receivedAt: 3,
      requestId: 'r4',
    },
  };
  const out = d.deserialize(envelope) as {
    pattern: string;
    data: typeof envelope.data;
  };
  assert.equal(out.pattern, IOT_BRIDGE_UPSTREAM_EVENT);
  assert.deepEqual(out.data, envelope.data);
});

test('IotBridgeIncomingDeserializer maps raw EMQX webhook lifecycle payload to normalized uplink', () => {
  const d = new IotBridgeIncomingDeserializer();
  const raw = {
    event: 'client.connected',
    clientid: 'device-009',
    timestamp: 1710000000123,
  };
  const out = d.deserialize(raw) as {
    pattern: string;
    data: {
      vendor: string;
      topic: string;
      receivedAt: number;
      payload: Record<string, unknown>;
    };
  };
  assert.equal(out.pattern, IOT_BRIDGE_UPSTREAM_LIFECYCLE_EVENT);
  assert.equal(out.data.vendor, 'emqx');
  assert.equal(out.data.topic, 'emqx/client.connected/device-009');
  assert.equal(out.data.receivedAt, 1710000000123);
  assert.equal(out.data.payload.event, 'client.connected');
  assert.equal(out.data.payload.clientid, 'device-009');
});
