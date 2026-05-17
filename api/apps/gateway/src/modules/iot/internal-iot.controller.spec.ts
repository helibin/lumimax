import assert from 'node:assert/strict';
import { afterEach, beforeEach } from 'node:test';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import { InternalIotController } from './internal-iot.controller';

let savedIoMode: string | undefined;

beforeEach(() => {
  savedIoMode = process.env.IOT_RECEIVE_MODE;
  process.env.IOT_RECEIVE_MODE = 'callback';
});

afterEach(() => {
  if (savedIoMode === undefined) {
    delete process.env.IOT_RECEIVE_MODE;
  } else {
    process.env.IOT_RECEIVE_MODE = savedIoMode;
  }
});

test('InternalIotController authenticate validates secret and forwards body to biz-service', async () => {
  process.env.EMQX_AUTH_SECRET = 'secret-token';
  const grpcCalls: Array<{ operation: string; service: string }> = [];
  const adapterCalls: Array<Record<string, unknown>> = [];

  const grpcInvoker = {
    async invoke(input: {
      service: string;
      operation: string;
      call: () => Promise<unknown>;
    }) {
      grpcCalls.push({ service: input.service, operation: input.operation });
      return input.call();
    },
  };
  const adapter = {
    async authenticate(input: Record<string, unknown>) {
      adapterCalls.push(input);
      return { result: 'allow' };
    },
  };
  const auth = {
    authorize(headers: Record<string, string | string[] | undefined>) {
      const token = headers['x-internal-token'];
      const value = Array.isArray(token) ? token[0] : token;
      if (value !== 'secret-token') {
        throw new Error('invalid token');
      }
    },
  };
  const controller = new InternalIotController(grpcInvoker as any, adapter as any, auth as any);

  const result = await controller.authenticate(
    { 'x-internal-token': 'secret-token' },
    { clientid: 'abc' },
    { requestId: 'req-1' },
  );

  assert.deepEqual(result, { result: 'allow' });
  assert.deepEqual(grpcCalls, [{ service: 'biz-service', operation: 'Authenticate' }]);
  assert.deepEqual(adapterCalls, [{ body: { clientid: 'abc' }, requestId: 'req-1' }]);
});

test('InternalIotController authorize validates secret and forwards body to biz-service', async () => {
  const grpcCalls: Array<{ operation: string; service: string }> = [];
  const adapterCalls: Array<Record<string, unknown>> = [];

  const grpcInvoker = {
    async invoke(input: {
      service: string;
      operation: string;
      call: () => Promise<unknown>;
    }) {
      grpcCalls.push({ service: input.service, operation: input.operation });
      return input.call();
    },
  };
  const adapter = {
    async authorize(input: Record<string, unknown>) {
      adapterCalls.push(input);
      return { result: 'deny' };
    },
  };
  const auth = {
    authorize() {
      return;
    },
  };
  const controller = new InternalIotController(grpcInvoker as any, adapter as any, auth as any);

  const result = await controller.authorize(
    { authorization: 'Bearer secret-token' },
    { topic: 'devices/x/up', action: 'publish' },
    { requestId: 'req-2' },
  );

  assert.deepEqual(result, { result: 'deny' });
  assert.deepEqual(grpcCalls, [{ service: 'biz-service', operation: 'Authorize' }]);
  assert.deepEqual(adapterCalls, [{
    body: { topic: 'devices/x/up', action: 'publish' },
    requestId: 'req-2',
  }]);
});

test('InternalIotController ingest accepts EMQX message.publish body (string payload)', async () => {
  const grpcCalls: Array<{ operation: string; service: string }> = [];
  const adapterCalls: Array<Record<string, unknown>> = [];

  const grpcInvoker = {
    async invoke(input: {
      service: string;
      operation: string;
      call: () => Promise<unknown>;
    }) {
      grpcCalls.push({ service: input.service, operation: input.operation });
      return input.call();
    },
  };
  const adapter = {
    async ingestCloudMessage(input: Record<string, unknown>) {
      adapterCalls.push(input);
      return { success: true, message: 'ok' };
    },
  };
  const auth = { authorize() {} };
  const controller = new InternalIotController(grpcInvoker as any, adapter as any, auth as any);

  const emqxBody = {
    event: 'message.publish',
    topic: 'v1/event/01krgghshdk38p34jstk0f171r/req',
    clientid: '01krgghshdk38p34jstk0f171r',
    payload: JSON.stringify({ meta: { requestId: 'r1' }, data: { x: 1 } }),
    publish_received_at: 1778755934443,
  };

  await controller.ingest('emqx', emqxBody, { requestId: 'req-ingest-1' });

  assert.deepEqual(grpcCalls, [{ service: 'biz-service', operation: 'IngestCloudMessage' }]);
  assert.equal(adapterCalls.length, 1);
  assert.equal(adapterCalls[0].requestId, 'req-ingest-1');
  assert.equal(adapterCalls[0].topic, 'v1/event/01krgghshdk38p34jstk0f171r/req');
  const payload = adapterCalls[0].payload as Record<string, unknown>;
  assert.equal(payload.meta && typeof payload.meta === 'object' && (payload.meta as { requestId?: string }).requestId, 'r1');
  assert.equal(payload.data && typeof payload.data === 'object' && (payload.data as { x?: number }).x, 1);
});

test('InternalIotController ingest rejects when EMQX mq mode (HTTP would duplicate RabbitMQ uplink)', async () => {
  const prevVendor = process.env.IOT_VENDOR;
  const prevMode = process.env.IOT_RECEIVE_MODE;
  try {
    process.env.IOT_VENDOR = 'emqx';
    process.env.IOT_RECEIVE_MODE = 'mq';
    const grpcInvoker = {
      async invoke() {
        throw new Error('should not invoke');
      },
    };
    const adapter = { async ingestCloudMessage() {} };
    const auth = { authorize() {} };
    const controller = new InternalIotController(grpcInvoker as any, adapter as any, auth as any);
    await assert.rejects(
      () => controller.ingest('emqx', {}, { requestId: 'x' }),
      (err: unknown) => err instanceof ConflictException,
    );
  } finally {
    restoreEnv('IOT_VENDOR', prevVendor);
    restoreEnv('IOT_RECEIVE_MODE', prevMode);
  }
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
