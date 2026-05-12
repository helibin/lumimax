import assert from 'node:assert/strict';
import test from 'node:test';

test('AWS presence SQS rule payload can be normalized into disconnect lifecycle', async () => {
  const { IotNormalizerService } = await import('../src/iot/events/iot-normalizer.service');

  const normalizer = new IotNormalizerService(
    {
      parse() {
        throw new Error('not a protocol topic');
      },
    } as never,
    {
      validate() {
        throw new Error('not an envelope payload');
      },
    } as never,
  );

  const sqsBody = {
    topic: '$aws/events/presence/disconnected/Device-ABC-001',
    payload: {
      clientId: 'Device-ABC-001',
      timestamp: 1710000000000,
      disconnectReason: 'CLIENT_ERROR',
    },
    timestamp: 1710000000000,
  };

  const result = normalizer.normalize({
    vendor: 'aws',
    topic: sqsBody.topic,
    payload: sqsBody.payload,
    receivedAt: sqsBody.timestamp,
  });

  assert.equal(result.deviceId, 'Device-ABC-001');
  assert.equal(result.event, 'status.disconnected');
  assert.equal(result.requestId, 'aws:disconnected:Device-ABC-001:1710000000000');
});
