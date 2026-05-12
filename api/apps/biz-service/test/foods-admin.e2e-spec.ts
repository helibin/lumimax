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
      const entity = {
        createdAt: input.createdAt ?? new Date(),
        updatedAt: new Date(),
        id: input.id ?? `id_${items.length + 1}`,
        ...input,
      } as T;
      const index = items.findIndex((item) => item.id === entity.id);
      if (index >= 0) items[index] = entity;
      else items.push(entity);
      return entity;
    },
    async findAndCount() {
      return [items, items.length] as const;
    },
    async findOne(input: { where: Record<string, unknown> }) {
      return items.find((item) =>
        Object.entries(input.where).every(([key, value]) => item[key] === value),
      ) ?? null;
    },
    async find() {
      return items;
    },
  };
}

test('foods admin create update status uses local entities', async () => {
  const meals = repository<any>();
  const mealItems = repository<any>();
  const foods = repository<any>();
  const nutritions = repository<any>();
  const logs = repository<any>();
  const service = new DietApplicationService(
    meals as never,
    mealItems as never,
    foods as never,
    nutritions as never,
    logs as never,
  );

  const created = await service.callAdmin<Record<string, unknown>>({
    service: 'foods',
    method: 'CreateFood',
    payload: {
      body_json: JSON.stringify({
        name: 'banana',
        brand: 'default',
        countryCode: 'US',
        source: 'manual',
        caloriesPer100g: 89,
      }),
    },
    requestId: 'req_food_create',
  });
  const updated = await service.callAdmin<Record<string, unknown>>({
    service: 'foods',
    method: 'UpdateFood',
    payload: {
      id: String(created.id),
      body_json: JSON.stringify({
        brand: 'test-brand',
        proteinPer100g: 1.1,
      }),
    },
    requestId: 'req_food_update',
  });
  const status = await service.callAdmin<Record<string, unknown>>({
    service: 'foods',
    method: 'UpdateFoodStatus',
    payload: {
      id: String(created.id),
      body_json: JSON.stringify({
        status: 'inactive',
      }),
    },
    requestId: 'req_food_status',
  });

  assert.equal(created.name, 'banana');
  assert.equal(updated.brand, 'test-brand');
  assert.equal(status.status, 'inactive');
});
