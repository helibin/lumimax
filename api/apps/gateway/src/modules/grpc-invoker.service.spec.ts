import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { GrpcInvokerService } from './grpc-invoker.service';

function createEnvService(values: Record<string, number | undefined>) {
  return {
    getNumber(key: string, fallback: number) {
      return values[key] ?? fallback;
    },
  };
}

function createLogger() {
  return {
    log() {},
    warn() {},
  };
}

test('GrpcInvokerService maps grpc NOT_FOUND to NotFoundException', async () => {
  const service = new GrpcInvokerService(
    createEnvService({
      GATEWAY_GRPC_TIMEOUT_MS: 100,
      GATEWAY_GRPC_RETRY_COUNT: 0,
      GATEWAY_GRPC_RETRY_DELAY_MS: 0,
    }) as any,
    createLogger() as any,
  );

  await assert.rejects(
    () =>
      service.invoke({
        service: 'biz-service',
        operation: 'meals.get',
        requestId: '01h0000000000000000000101',
        call: async () => {
          const error = new Error('meal not found') as Error & { code: number };
          error.code = 5;
          throw error;
        },
      }),
    (error: unknown) =>
      error instanceof NotFoundException
      && error.message.includes('meal not found'),
  );
});

test('GrpcInvokerService retries once for UNAVAILABLE and then succeeds', async () => {
  const service = new GrpcInvokerService(
    createEnvService({
      GATEWAY_GRPC_TIMEOUT_MS: 200,
      GATEWAY_GRPC_RETRY_COUNT: 1,
      GATEWAY_GRPC_RETRY_DELAY_MS: 0,
    }) as any,
    createLogger() as any,
  );

  let attempts = 0;
  const result = await service.invoke({
    service: 'biz-service',
    operation: 'foods.suggest',
    requestId: '01h0000000000000000000102',
    call: async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error('upstream unavailable') as Error & { code: number };
        error.code = 14;
        throw error;
      }
      return { ok: true, attempts };
    },
  });

  assert.deepEqual(result, { ok: true, attempts: 2 });
  assert.equal(attempts, 2);
});
