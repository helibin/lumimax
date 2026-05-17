import assert from 'node:assert/strict';
import test from 'node:test';

import { AwsIotSqsConsumer } from '../src/ingress/aws-iot-sqs.consumer';

test('AwsIotSqsConsumer does not start when IOT_VENDOR is not aws', async () => {
  const previousVendor = process.env.IOT_VENDOR;
  const previousReceiveMode = process.env.IOT_RECEIVE_MODE;
  const previousQueueUrl = process.env.AWS_SQS_QUEUE_URL;

  let pollCalled = false;
  const logs: Array<Record<string, unknown>> = [];

  try {
    process.env.IOT_VENDOR = 'emqx';
    process.env.IOT_RECEIVE_MODE = 'mq';
    process.env.AWS_SQS_QUEUE_URL = 'https://sqs.us-west-2.amazonaws.com/123456789012/test-queue';

    const consumer = new AwsIotSqsConsumer(
      {
        log(message: string, meta?: Record<string, unknown>) {
          logs.push({ message, meta });
        },
      } as never,
      {
        async poll() {
          pollCalled = true;
          return [];
        },
      } as never,
      {} as never,
      {} as never,
    );

    await consumer.onModuleInit();

    assert.equal(pollCalled, false);
    assert.equal(
      logs.some(
        (entry) => {
          const meta = (entry.meta ?? {}) as Record<string, unknown>;
          return (
          entry.message === 'AWS IoT SQS 消费器未启用'
          && meta.vendor === 'emqx'
          );
        },
      ),
      true,
    );
  } finally {
    restoreEnv('IOT_VENDOR', previousVendor);
    restoreEnv('IOT_RECEIVE_MODE', previousReceiveMode);
    restoreEnv('AWS_SQS_QUEUE_URL', previousQueueUrl);
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
