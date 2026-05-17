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
      async bridgeUplink(payload: Record<string, unknown>, input: Record<string, unknown>) {
        assert.equal(payload.requestId, 'uplink-1');
        assert.equal(payload.topic, 'v1/event/device-001/req');
        assert.equal(input.eventName, 'iot.up.event');
        assert.equal(input.transport, 'rmq');
        assert.deepEqual((input.meta as { fields?: Record<string, unknown> } | undefined)?.fields, { routingKey: 'test' });
      },
    } as never,
    {
      debug() {},
      warn() {},
      info() {},
      error() {},
    } as never,
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
      async bridgeUplink() {
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
  let bridged = false;
  const controller = new IotBridgeRabbitmqController(
    {
      async bridgeUplink() {
        bridged = true;
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

  assert.equal(bridged, true);
  assert.equal(calls.ack, 1);
  assert.equal(calls.nack, 0);
});
