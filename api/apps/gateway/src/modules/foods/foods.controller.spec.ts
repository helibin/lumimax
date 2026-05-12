import assert from 'node:assert/strict';
import test from 'node:test';
import { UserType, type AuthenticatedUser } from '@lumimax/auth';
import { UnauthorizedException } from '@nestjs/common';
import { FoodsController } from './foods.controller';

function buildUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    userId: '01h0000000000000000000001',
    type: UserType.CUSTOMER,
    tenantId: '01h0000000000000000000011',
    roles: [],
    permissions: [],
    policies: [],
    ...overrides,
  };
}

test('FoodsController suggest forwards query to foods.suggest', async () => {
  const adapterCalls: Array<Record<string, unknown>> = [];
  const grpcInvokerCalls: Array<{ operation: string; service: string }> = [];

  const grpcInvoker = {
    async invoke(input: {
      service: string;
      operation: string;
      call: () => Promise<unknown>;
    }) {
      grpcInvokerCalls.push({
        service: input.service,
        operation: input.operation,
      });
      return input.call();
    },
  };
  const bizDietGrpcAdapter = {
    async execute(input: Record<string, unknown>) {
      adapterCalls.push(input);
      return { ok: true };
    },
  };
  const controller = new FoodsController(grpcInvoker as any, bizDietGrpcAdapter as any);

  const req = {
    requestId: '01h0000000000000000000101',
    user: buildUser(),
  };

  const result = await controller.suggest(req, { q: 'rice', limit: 5 });

  assert.equal((result as { ok: boolean }).ok, true);
  assert.equal(grpcInvokerCalls.length, 1);
  assert.deepEqual(grpcInvokerCalls[0], {
    service: 'biz-service',
    operation: 'foods.suggest',
  });
  assert.equal(adapterCalls.length, 1);
  assert.equal(adapterCalls[0]?.operation, 'foods.suggest');
  assert.deepEqual(adapterCalls[0]?.query, { q: 'rice', limit: 5 });
});

test('FoodsController suggest forwards locale and market to downstream service', async () => {
  const adapterCalls: Array<Record<string, unknown>> = [];
  const grpcInvoker = {
    async invoke(input: {
      call: () => Promise<unknown>;
    }) {
      return input.call();
    },
  };
  const bizDietGrpcAdapter = {
    async execute(input: Record<string, unknown>) {
      adapterCalls.push(input);
      return { ok: true };
    },
  };
  const controller = new FoodsController(grpcInvoker as any, bizDietGrpcAdapter as any);

  const req = {
    requestId: '01h0000000000000000000103',
    user: buildUser(),
  };

  await controller.suggest(req, { q: 'rice', limit: 5, locale: 'en-US', market: 'US' });

  assert.equal(adapterCalls.length, 1);
  assert.deepEqual(adapterCalls[0]?.query, {
    q: 'rice',
    limit: 5,
    locale: 'en-US',
    market: 'US',
  });
});

test('FoodsController suggest throws when user context missing', () => {
  const grpcInvoker = {
    async invoke(input: {
      call: () => Promise<unknown>;
    }) {
      return input.call();
    },
  };
  const bizDietGrpcAdapter = {
    async execute() {
      return { ok: true };
    },
  };
  const controller = new FoodsController(grpcInvoker as any, bizDietGrpcAdapter as any);
  const req = {
    requestId: '01h0000000000000000000102',
  };

  assert.throws(
    () => controller.suggest(req, { q: 'rice', limit: 5 }),
    (error: unknown) =>
      error instanceof UnauthorizedException
      && error.message.includes('Missing user context'),
  );
});
