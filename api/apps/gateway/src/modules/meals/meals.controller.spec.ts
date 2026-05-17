import assert from 'node:assert/strict';
import test from 'node:test';
import { UserType, type AuthenticatedUser } from '@lumimax/auth';
import { UnauthorizedException } from '@nestjs/common';
import { MealsController } from './meals.controller';

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

function createController() {
  const invocations: Array<{
    service: string;
    operation: string;
    requestId?: string;
    callResult: unknown;
  }> = [];
  const adapterCalls: Array<Record<string, unknown>> = [];

  const grpcInvoker = {
    async invoke(input: {
      service: string;
      operation: string;
      requestId?: string;
      timeoutMs?: number;
      call: () => Promise<unknown>;
    }) {
      const callResult = await input.call();
      invocations.push({
        service: input.service,
        operation: input.operation,
        requestId: input.requestId,
        callResult,
      });
      return callResult;
    },
  };

  const bizDietGrpcAdapter = {
    async execute(input: Record<string, unknown>) {
      adapterCalls.push(input);
      return {
        ok: true,
        operation: input.operation,
      };
    },
  };

  const envService = {
    getNumber(_key: string, fallback: number) {
      return fallback;
    },
  };

  const controller = new MealsController(envService as any, grpcInvoker as any, bizDietGrpcAdapter as any);
  return { controller, invocations, adapterCalls };
}

test('MealsController confirm forwards item params and body', async () => {
  const { controller, invocations, adapterCalls } = createController();
  const req = {
    requestId: '01h0000000000000000000103',
    user: buildUser(),
  };

  const result = await controller.confirm(req, '01h0000000000000000000201', '01h0000000000000000000202', {
    correctedName: 'rice',
    correctedWeightGram: 100,
    correctedCount: 2,
    selectedFoodId: '01hfood0000000000000000001',
    confirmationSource: 'user_common_selected',
    locale: 'zh-CN',
    market: 'CN',
  });

  assert.equal((result as { ok: boolean }).ok, true);
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0]?.operation, 'meals.items.confirm');
  assert.equal(adapterCalls.length, 1);
  assert.deepEqual(adapterCalls[0]?.params, {
    id: '01h0000000000000000000201',
    itemId: '01h0000000000000000000202',
  });
  assert.deepEqual(adapterCalls[0]?.body, {
    correctedName: 'rice',
    correctedWeightGram: 100,
    correctedCount: 2,
    selectedFoodId: '01hfood0000000000000000001',
    confirmationSource: 'user_common_selected',
    locale: 'zh-CN',
    market: 'CN',
  });
});

test('MealsController analyze forwards locale and market to downstream service', async () => {
  const { controller, adapterCalls } = createController();
  const req = {
    requestId: '01h0000000000000000000106',
    user: buildUser(),
  };

  await controller.analyze(req, '01h0000000000000000000203', {
    imageKey: 'tmp-file/user/01HUSER/demo.png',
    weightGram: 88,
    locale: 'en-US',
    market: 'US',
  });

  assert.equal(adapterCalls.length, 1);
  assert.deepEqual(adapterCalls[0]?.body, {
    imageKey: 'tmp-file/user/01HUSER/demo.png',
    weightGram: 88,
    locale: 'en-US',
    market: 'US',
  });
});

test('MealsController list forwards query pagination', async () => {
  const { controller, adapterCalls } = createController();
  const req = {
    requestId: '01h0000000000000000000104',
    user: buildUser(),
  };

  await controller.list(req, { page: 2, pageSize: 10 });

  assert.equal(adapterCalls.length, 1);
  assert.equal(adapterCalls[0]?.operation, 'meals.list');
  assert.deepEqual(adapterCalls[0]?.query, { page: 2, pageSize: 10 });
});

test('MealsController list throws when user context missing', () => {
  const { controller } = createController();
  const req = {
    requestId: '01h0000000000000000000105',
  };

  assert.throws(
    () => controller.list(req, { page: 1, pageSize: 20 }),
    (error: unknown) =>
      error instanceof UnauthorizedException
      && error.message.includes('Missing user context'),
  );
});
