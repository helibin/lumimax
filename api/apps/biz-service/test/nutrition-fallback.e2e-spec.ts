import assert from 'node:assert/strict';
import test from 'node:test';
import { DietApplicationService } from '../src/modules/diet/diet-application.service';

function repo<T extends Record<string, any>>(seed: T[] = []) {
  const items = [...seed];
  return {
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

test('nutrition fallback marks recognition status as fallback', async () => {
  const meals = repo<any>([
    {
      id: 'meal_1',
      userId: 'user_1',
      deviceId: 'device_1',
      status: 'created',
      totalCalories: '0',
      totalWeight: '0',
    },
  ]);
  const items = repo<any>();
  const foods = repo<any>();
  const nutritions = repo<any>();
  const logs = repo<any>();
  const service = new DietApplicationService(
    meals as never,
    items as never,
    foods as never,
    nutritions as never,
    logs as never,
  );

  const analyzed = await service.analyzeFoodItem({
    mealRecordId: 'meal_1',
    userId: 'user_1',
    deviceId: 'device_1',
    type: 'image',
    target: 'tmp-file/device/device_1/chicken.png',
    imageKey: 'tmp-file/device/device_1/chicken.png',
    weightGram: 100,
    requestId: 'req_fallback',
  });

  assert.equal((analyzed.food as any).recognitionStatus, 'fallback');
});
