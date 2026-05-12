import assert from 'node:assert/strict';
import test from 'node:test';
import { DietImageStorageService } from '../src/diet/food-analysis/diet-image-storage.service';

test('device scoped tmp image validates and promotes with device ownership', async () => {
  const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
  const service = new DietImageStorageService(
    {
      log() {},
    } as never,
    {
      async validateObjectKeys(body: Record<string, unknown>) {
        calls.push({ method: 'validate', body });
        return { ok: true };
      },
      async promoteObjectKey(body: Record<string, unknown>) {
        calls.push({ method: 'promote', body });
        return {
          objectKey: 'formal-file/diet/meal_1/device-image.png',
          provider: 'aws',
          bucket: 'lumimax-dev',
          region: 'us-west-2',
        };
      },
      async createSignedReadUrl(body: Record<string, unknown>) {
        calls.push({ method: 'createSignedReadUrl', body });
        return {
          readUrl: 'https://lumimax-dev.s3.us-west-2.amazonaws.com/formal-file/diet/meal_1/device-image.png?X-Amz-Signature=demo',
        };
      },
    } as never,
  );

  const result = await service.prepareSingleImage({
    requestId: '01k00000000000000000000001',
    imageKey: 'tmp-file/device/01kqaey25yg7cdqc699vr74e6r/device-image.png',
    mealRecordId: '01kmeal0000000000000000001',
    userId: '01kuser0000000000000000001',
    deviceId: '01kqaey25yg7cdqc699vr74e6r',
  });

  assert.equal(result.imageKey, 'formal-file/diet/meal_1/device-image.png');
  assert.equal(result.readUrl, 'https://lumimax-dev.s3.us-west-2.amazonaws.com/formal-file/diet/meal_1/device-image.png?X-Amz-Signature=demo');
  assert.deepEqual(calls, [
    {
      method: 'validate',
      body: {
        requestId: '01k00000000000000000000001',
        imageKey: 'tmp-file/device/01kqaey25yg7cdqc699vr74e6r/device-image.png',
        objectKey: 'tmp-file/device/01kqaey25yg7cdqc699vr74e6r/device-image.png',
        sourceObjectKey: 'tmp-file/device/01kqaey25yg7cdqc699vr74e6r/device-image.png',
        userId: null,
        deviceId: '01kqaey25yg7cdqc699vr74e6r',
      },
    },
    {
      method: 'promote',
      body: {
        requestId: '01k00000000000000000000001',
        imageKey: 'tmp-file/device/01kqaey25yg7cdqc699vr74e6r/device-image.png',
        sourceObjectKey: 'tmp-file/device/01kqaey25yg7cdqc699vr74e6r/device-image.png',
        mealRecordId: '01kmeal0000000000000000001',
        bizId: '01kmeal0000000000000000001',
        bizType: 'diet',
        mediaType: 'image',
        userId: null,
        deviceId: '01kqaey25yg7cdqc699vr74e6r',
      },
    },
    {
      method: 'createSignedReadUrl',
      body: {
        objectKey: 'formal-file/diet/meal_1/device-image.png',
      },
    },
  ]);
});
