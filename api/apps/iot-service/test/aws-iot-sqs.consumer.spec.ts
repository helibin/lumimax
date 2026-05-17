import assert from 'node:assert/strict';
import test from 'node:test';

import { AwsSqsIngress } from '../src/ingress/aws-sqs/aws-sqs.ingress';

test('AwsSqsIngress does not start when IOT_VENDOR is not aws', async () => {
  const previousVendor = process.env.IOT_VENDOR;
  const previousReceiveMode = process.env.IOT_RECEIVE_MODE;
  const previousQueueUrl = process.env.AWS_SQS_QUEUE_URL;

  let pollCalled = false;
  const logs: Array<Record<string, unknown>> = [];

  try {
    process.env.IOT_VENDOR = 'emqx';
    process.env.IOT_RECEIVE_MODE = 'mq';
    process.env.AWS_SQS_QUEUE_URL = 'https://sqs.us-west-2.amazonaws.com/123456789012/test-queue';

    const consumer = new AwsSqsIngress(
      {
        log(message: string, meta?: Record<string, unknown>) {
          logs.push({ message, meta });
        },
        warn() {},
        error() {},
      } as never,
      {
        async poll() {
          pollCalled = true;
          return [];
        },
        async ack() {},
      } as never,
      {} as never,
      {} as never,
    );

    await consumer.onModuleInit();

    assert.equal(pollCalled, false);
    assert.equal(logs.length, 0);
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
