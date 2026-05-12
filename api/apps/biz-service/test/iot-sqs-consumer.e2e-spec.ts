import assert from 'node:assert/strict';
import test from 'node:test';
import { IotIngestService } from '../src/modules/iot/iot-ingest.service';

test('iot ingest skips already handled requestId for idempotency', async () => {
  const service = new IotIngestService(
    {
      normalize() {
        return {
          vendor: 'aws',
          topic: 'v1/event/device_001/req',
          deviceId: 'device_001',
          topicKind: 'event.req',
          requestId: 'req_001',
          event: 'food.analysis.request',
          payload: {},
          timestamp: Date.now(),
          receivedAt: new Date(),
        };
      },
    } as never,
    {
      async dispatch() {
        throw new Error('should not dispatch duplicate');
      },
    } as never,
    {
      async isHandled() {
        return true;
      },
    } as never,
    {
      async publish() {
        throw new Error('should not publish duplicate');
      },
    } as never,
  );

  const result = await service.ingestCloudMessage({
    vendor: 'aws',
    topic: 'v1/event/device_001/req',
    payload: {},
  });

  assert.equal(result.success, true);
  assert.equal(result.message, 'duplicate skipped');
  assert.equal(result.result?.duplicate, true);
});
