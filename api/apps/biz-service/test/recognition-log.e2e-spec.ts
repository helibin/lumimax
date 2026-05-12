import assert from 'node:assert/strict';
import test from 'node:test';
import { DietApplicationService } from '../src/modules/diet/diet-application.service';

function repository<T extends Record<string, any>>(seed: T[] = []) {
  const items = [...seed];
  return {
    items,
    create(input: T) {
      return { ...input } as T;
    },
    async save(input: T) {
      const entity = { createdAt: new Date(), updatedAt: new Date(), id: input.id ?? `id_${items.length + 1}`, ...input } as T;
      const index = items.findIndex((item) => item.id === entity.id);
      if (index >= 0) items[index] = entity;
      else items.push(entity);
      return entity;
    },
    async findOne(input: { where: Record<string, unknown> }) {
      return items.find((item) => Object.entries(input.where).every(([key, value]) => item[key] === value)) ?? null;
    },
    async count(input?: { where?: Record<string, unknown> }) {
      if (!input?.where) return items.length;
      return items.filter((item) => Object.entries(input.where!).every(([key, value]) => item[key] === value)).length;
    },
    async find() {
      return items;
    },
  };
}

test('analyze food item writes recognition log with single image fields', async () => {
  const meals = repository<any>([
    {
      id: 'meal_1',
      userId: 'user_1',
      deviceId: 'device_1',
      status: 'created',
      totalCalories: '0',
      totalWeight: '0',
    },
  ]);
  const items = repository<any>();
  const foods = repository<any>();
  const nutritions = repository<any>();
  const logs = repository<any>();
  const service = new DietApplicationService(
    meals as never,
    items as never,
    foods as never,
    nutritions as never,
    logs as never,
  );

  await service.analyzeFoodItem({
    mealRecordId: 'meal_1',
    userId: 'user_1',
    deviceId: 'device_1',
    imageKey: 'tmp-file/device/device_1/apple.png',
    imageObjectId: 'obj_1',
    weightGram: 80,
    requestId: 'req_log',
  });

  assert.equal(logs.items.length, 1);
  assert.equal(logs.items[0].imageKey, 'tmp-file/device/device_1/apple.png');
  assert.equal(logs.items[0].requestPayloadJson.imageObjectId, 'obj_1');
  assert.ok(!('images' in logs.items[0].requestPayloadJson));
});
