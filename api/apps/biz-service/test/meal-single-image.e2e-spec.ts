import assert from 'node:assert/strict';
import test from 'node:test';
import { DietFacadeService } from '../src/modules/diet/diet-facade.service';

test('meal analyze accepts image_object_id alias and keeps single-image model', async () => {
  const service = new DietFacadeService(
    {
      async analyzeFoodItem(input: Record<string, unknown>) {
        return input;
      },
    } as never,
    {
      async prepareSingleImage() {
        return {
          imageKey: 'formal-file/diet/meal_1.png',
          imageObjectKey: 'obj_1',
          objectKey: 'formal-file/diet/meal_1.png',
        };
      },
    } as never,
  );

  const result = await (service as any).dispatch({
    operation: 'meals.items.analyze',
    params: { id: 'meal_1' },
    body: {
      imageKey: 'tmp-file/user/user_1/a.png',
      image_object_id: 'obj_alias',
      weightGram: 88,
    },
    user: { userId: 'user_1' },
    requestId: 'req_1',
  });

  assert.equal(result.imageObjectId, 'obj_alias');
  assert.ok(!('images' in result));
});
