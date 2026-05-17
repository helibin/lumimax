import assert from 'node:assert/strict';
import test from 'node:test';
import { DownstreamConsumer } from '../src/rabbitmq/downstream.consumer';

function createContext() {
  const calls = {
    ack: 0,
    nack: 0,
  };
  const message = { fields: { routingKey: 'iot.down.publish' } };
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
            assert.equal(typeof requeue, 'boolean');
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

test('downstream consumer skips already published outbox messages', async () => {
  const { context, calls } = createContext();
  let dispatchCalled = false;
  const controller = new DownstreamConsumer(
    {
      parse() {
        return { deviceId: 'device-001' };
      },
    } as never,
    {
      async findOutboxMessageById() {
        return { status: 'published' };
      },
      async resolveDeviceByIdOrSn() {
        throw new Error('resolveDeviceByIdOrSn should not be called for published message');
      },
    } as never,
    {
      async dispatch() {
        dispatchCalled = true;
      },
    } as never,
    { debug() {}, warn() {}, info() {}, error() {} } as never,
  );

  await controller.handleDownstream(
    {
      direction: 'down',
      provider: 'auto',
      messageId: 'downlink-1',
      deviceId: 'device-001',
      topic: 'v1/connect/device-001/res',
      event: 'connect.register.result',
      payload: { meta: {}, data: {} },
      requestId: 'request-1',
    },
    context as never,
  );

  assert.equal(dispatchCalled, false);
  assert.equal(calls.ack, 1);
  assert.equal(calls.nack, 0);
});
