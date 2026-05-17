import assert from 'node:assert/strict';
import test from 'node:test';
import { DietApplicationService } from '../src/modules/diet/diet-application.service';

function createRepository<T extends Record<string, any>>(seed: T[] = []) {
  const items = [...seed];
  return {
    items,
    create(input: T) {
      return { ...input } as T;
    },
    async save(input: T) {
      const id = input.id ?? `id_${items.length + 1}`;
      const entity = {
        createdAt: input.createdAt ?? new Date(),
        updatedAt: new Date(),
        ...input,
        id,
      } as T;
      const index = items.findIndex((item) => item.id === id);
      if (index >= 0) items[index] = entity;
      else items.push(entity);
      return entity;
    },
    async findOne(input: { where: Record<string, unknown> }) {
      return items.find((item) =>
        Object.entries(input.where).every(([key, value]) => item[key] === value),
      ) ?? null;
    },
    async find(input?: { where?: Record<string, unknown>; order?: Record<string, 'ASC' | 'DESC'> }) {
      let result = [...items];
      if (input?.where) {
        result = result.filter((item) =>
          Object.entries(input.where!).every(([key, value]) => item[key] === value),
        );
      }
      return result;
    },
    async count(input?: { where?: Record<string, unknown> }) {
      if (!input?.where) return items.length;
      return items.filter((item) =>
        Object.entries(input.where!).every(([key, value]) => item[key] === value),
      ).length;
    },
    async findAndCount() {
      return [items, items.length] as const;
    },
  };
}

test('meal flow supports create analyze analyze finish sequence', async () => {
  const meals = createRepository<any>();
  const mealItems = createRepository<any>();
  const foods = createRepository<any>();
  const nutritions = createRepository<any>();
  const logs = createRepository<any>();
  const service = new DietApplicationService(
    meals as never,
    mealItems as never,
    foods as never,
    nutritions as never,
    logs as never,
  );

  const created = await service.createMealRecord({
    userId: 'user_1',
    deviceId: 'device_1',
    requestId: 'req_create',
  });
  const mealRecordId = String(created.mealRecordId);

  const first = await service.analyzeFoodItem({
    mealRecordId,
    userId: 'user_1',
    deviceId: 'device_1',
    type: 'image',
    target: 'tmp-file/device/device_1/apple.png',
    imageKey: 'tmp-file/device/device_1/apple.png',
    weightGram: 100,
    requestId: 'req_analyze_1',
  });
  const second = await service.analyzeFoodItem({
    mealRecordId,
    userId: 'user_1',
    deviceId: 'device_1',
    type: 'image',
    target: 'tmp-file/device/device_1/rice.png',
    imageKey: 'tmp-file/device/device_1/rice.png',
    weightGram: 50,
    requestId: 'req_analyze_2',
  });
  const finished = await service.finishMealRecord({
    mealRecordId,
    userId: 'user_1',
    requestId: 'req_finish',
  });

  assert.equal(first.mealRecordId, mealRecordId);
  assert.equal(second.mealRecordId, mealRecordId);
  assert.equal(finished.status, 'finished');
  assert.equal((finished.items as Array<unknown>).length, 2);
});
