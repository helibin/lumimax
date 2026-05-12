import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGrpcJson } from '@lumimax/integration/grpc/gateway-grpc.util';
import { UserType, type AuthenticatedUser } from '@lumimax/auth';
import { DietFacade } from './diet.facade';

function buildUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    userId: '01huser0000000000000000001',
    type: UserType.CUSTOMER,
    tenantId: '01htenant0000000000000001',
    roles: [],
    permissions: [],
    policies: [],
    ...overrides,
  };
}

test('DietFacade execute accepts confirm correction aliases without inferring market from locale', async () => {
  const confirmCalls: Array<Record<string, unknown>> = [];
  const facade = new DietFacade(
    {
      async confirmFoodItem(input: Record<string, unknown>) {
        confirmCalls.push(input);
        return {
          ok: true,
          ...input,
        };
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const reply = await facade.execute({
    operation: 'meals.items.confirm',
    params: {
      id: '01hmeal000000000000000001',
      itemId: '01hitem00000000000000001',
    },
    body: {
      name: '番茄炒蛋',
      weight: 118,
      locale: 'zh-CN',
    },
    user: buildUser(),
    tenantScope: '01htenant0000000000000001',
    requestId: '01hreq0000000000000000001',
  });

  assert.equal(reply.success, true);
  assert.equal(confirmCalls.length, 1);
  assert.deepEqual(confirmCalls[0], {
    mealRecordId: '01hmeal000000000000000001',
    itemId: '01hitem00000000000000001',
    userId: '01huser0000000000000000001',
    foodName: '番茄炒蛋',
    selectedFoodId: undefined,
    correctedCount: undefined,
    confirmationSource: undefined,
    weightGram: 118,
    locale: 'zh-CN',
    market: undefined,
    requestId: '01hreq0000000000000000001',
  });

  const data = parseGrpcJson<Record<string, unknown> | null>(reply.data_json, null);
  assert.equal(data?.foodName, '番茄炒蛋');
  assert.equal(data?.market, undefined);
});
