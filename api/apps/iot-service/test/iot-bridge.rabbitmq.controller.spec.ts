import assert from 'node:assert/strict';
import test from 'node:test';
import { IotBridgeRabbitmqController } from '../src/transport/iot-bridge.rabbitmq.controller';

function createContext() {
  const calls = {
    ack: 0,
    nack: 0,
  };
  const message = { fields: { routingKey: 'test' } };
  return {
    calls,
    context: {
      getChannelRef() {
        return {
          ack(input: unknown) {
            assert.equal(input, message);
            calls.ack += 1;
          },
          nack(input: unknown, allUpTo: boolean, requeue: boolean) {
            assert.equal(input, message);
            assert.equal(allUpTo, false);
            assert.equal(requeue, false);
            calls.nack += 1;
          },
        };
      },
      getMessage() {
        return message;
      },
    },
  };
}

test('bridge controller acks uplink on success', async () => {
  const { context, calls } = createContext();
  const controller = new IotBridgeRabbitmqController(
    {
      normalize(input: Record<string, unknown>) {
        assert.equal(input.topic, 'v1/event/device-001/req');
        return {
          vendor: 'emqx',
          topic: 'v1/event/device-001/req',
          deviceId: 'device-001',
          topicKind: 'event.req',
          requestId: 'uplink-1',
          event: 'demo',
          locale: 'en-US',
          payload: { ok: true },
          timestamp: Date.now(),
          receivedAt: new Date(),
        };
      },
    } as never,
    {
      async recordReceived() {
        return { duplicate: false, entity: { status: 'received' } };
      },
      async markQueued() {},
    } as never,
    {
      async emitEvent(_eventName: string, payload: Record<string, unknown>) {
        assert.equal(payload.requestId, 'uplink-1');
      },
    } as never,
    { debug() {}, warn() {}, info() {}, error() {} } as never,
  );

  await controller.handleEvent(
    {
      vendor: 'emqx',
      topic: 'v1/event/device-001/req',
      payload: { ok: true },
      receivedAt: Date.now(),
      requestId: 'uplink-1',
    },
    context as never,
  );

  assert.equal(calls.ack, 1);
  assert.equal(calls.nack, 0);
});

test('bridge controller nacks uplink on failure', async () => {
  const { context, calls } = createContext();
  const controller = new IotBridgeRabbitmqController(
    {
      normalize() {
        throw new Error('ingest failed');
      },
    } as never,
    {
      async recordReceived() {
        return { duplicate: false, entity: { status: 'received' } };
      },
      async markQueued() {},
    } as never,
    {
      async emitEvent() {
        throw new Error('ingest failed');
      },
    } as never,
    { debug() {}, warn() {}, info() {}, error() {} } as never,
  );

  await assert.rejects(
    controller.handleEvent(
      {
        vendor: 'emqx',
        topic: 'v1/event/device-001/req',
        payload: { ok: true },
        receivedAt: Date.now(),
        requestId: 'uplink-2',
      },
      context as never,
    ),
    /ingest failed/,
  );

  assert.equal(calls.ack, 0);
  assert.equal(calls.nack, 1);
});

test('bridge controller skips duplicate uplink that is still received', async () => {
  const { context, calls } = createContext();
  let emitted = false;
  const controller = new IotBridgeRabbitmqController(
    {
      normalize() {
        return {
          vendor: 'emqx',
          topic: 'v1/connect/device-001/req',
          deviceId: 'device-001',
          topicKind: 'connect.req',
          requestId: 'uplink-duplicate',
          event: 'connect.register',
          locale: 'en-US',
          payload: { ok: true },
          timestamp: Date.now(),
          receivedAt: new Date(),
        };
      },
    } as never,
    {
      async recordReceived() {
        return {
          duplicate: true,
          entity: {
            messageKey: 'uplink-duplicate',
            status: 'received',
          },
        };
      },
      async markQueued() {
        throw new Error('markQueued should not be called for duplicate received uplink');
      },
    } as never,
    {
      async emitEvent() {
        emitted = true;
      },
    } as never,
    { debug() {}, warn() {}, info() {}, error() {} } as never,
  );

  await controller.handleEvent(
    {
      vendor: 'emqx',
      topic: 'v1/connect/device-001/req',
      payload: { ok: true },
      receivedAt: Date.now(),
      requestId: 'uplink-duplicate',
    },
    context as never,
  );

  assert.equal(emitted, false);
  assert.equal(calls.ack, 1);
  assert.equal(calls.nack, 0);
});
