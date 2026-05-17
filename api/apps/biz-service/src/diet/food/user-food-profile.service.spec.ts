import assert from 'node:assert/strict';
import test from 'node:test';
import type { MealItemEntity } from '../../common/entities/biz.entities';
import { UserFoodProfileService } from './user-food-profile.service';
import { FoodIdentityService } from './food-identity.service';

function mealItem(partial: Partial<MealItemEntity>): MealItemEntity {
  return {
    id: partial.id ?? 'item_1',
    tenantId: partial.tenantId ?? 'tenant_1',
    userId: partial.userId ?? 'user_1',
    foodName: partial.foodName ?? '鸡蛋',
    weight: partial.weight ?? '100',
    calories: partial.calories ?? '140',
    protein: partial.protein ?? '12',
    fat: partial.fat ?? '10',
    carbs: partial.carbs ?? '1',
    recognitionStatus: partial.recognitionStatus ?? 'confirmed',
    createdAt: partial.createdAt ?? new Date('2026-05-01T08:00:00.000Z'),
  } as MealItemEntity;
}

test('listAdminUserCommonFoods aggregates confirmed meal items by user and food', async () => {
  const rows = [
    mealItem({ id: '1', foodName: '鸡蛋', createdAt: new Date('2026-05-02T08:00:00.000Z') }),
    mealItem({ id: '2', foodName: '鸡蛋', createdAt: new Date('2026-05-01T08:00:00.000Z') }),
    mealItem({ id: '3', userId: 'user_2', foodName: '牛奶' }),
  ];
  const service = new UserFoodProfileService(
    {
      find: async () => rows,
    } as never,
    new FoodIdentityService(),
  );

  const result = await service.listAdminUserCommonFoods({
    tenantId: 'tenant_1',
    page: 1,
    pageSize: 10,
  });

  assert.equal(result.total, 2);
  assert.equal(result.items[0]?.foodName, '鸡蛋');
  assert.equal(result.items[0]?.usageCount, 2);
  assert.equal(result.items[1]?.foodName, '牛奶');
});
