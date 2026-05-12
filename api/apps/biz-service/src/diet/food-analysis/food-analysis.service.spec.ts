import assert from 'node:assert/strict';
import test from 'node:test';
import { FoodAnalysisService } from './food-analysis.service';

test('vision timeout interrupts analysis instead of falling back', async () => {
  const service = new FoodAnalysisService(
    {
      log() {},
      warn() {},
      error() {},
    } as never,
    {
      resolveActive() {
        return {
          name: 'gemini',
          provider: {
            async identifyFood() {
              throw new Error(
                'POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=%5BREDACTED%5D 请求失败: fetch failed；原因=UND_ERR_CONNECT_TIMEOUT: Connect Timeout Error',
              );
            },
          },
        };
      },
    } as never,
    {
      buildIdentity(input: { name: string }) {
        return {
          canonicalName: input.name,
          normalizedName: input.name,
        };
      },
    } as never,
  );

  await assert.rejects(
    service.identifyFood({
      requestId: 'req_timeout_1',
      imageKey: 'file/device/demo/image.png',
      imageUrl: 'https://example.com/demo.png',
    }),
    /图片识别超时/,
  );
});
