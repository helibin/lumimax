import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveIotBridgeRabbitmqUrl, shouldUseIotBridgeRabbitmq, resolveIotBridgeEventPattern } from '../src/iot/transport/iot-bridge.rabbitmq';
import { IotDownlinkService } from '../src/iot/transport/iot-downlink.service';
import { BizIotTopicKind } from '../src/iot/iot.types';
import { TopicParserService } from '../src/iot/pipeline/topic-parser.service';
import type {
  IotMessagePublisherPort,
  PublishIotDownlinkCommandInput,
} from '../src/iot/transport/iot-message-publisher.port';

test('启用后 iot downlink 会通过 rabbitmq bridge 对 emqx 下行发布入队', async () => {
  const previousUrl = process.env.RABBITMQ_URL;
  process.env.RABBITMQ_URL = 'amqp://root:rd@localhost:5672/lumimax';

  const queued: PublishIotDownlinkCommandInput[] = [];
  const saved: Array<Record<string, unknown>> = [];
  const service = new IotDownlinkService(
    {
      findOne: async ({ where }: { where?: Record<string, unknown> }) =>
        saved.find((item) => item.id === where?.id || item.messageKey === where?.messageKey) ?? null,
      create() {
        return {} as never;
      },
      async save(input: Record<string, unknown>) {
        if (!input.id) {
          input.id = 'msg-1';
        }
        const index = saved.findIndex((item) => item.id === input.id);
        if (index >= 0) {
          saved[index] = { ...saved[index], ...input };
        } else {
          saved.push({ ...input });
        }
        return input;
      },
    } as never,
    {
      async findOne() {
        return { id: 'device-001', productKey: 'pk-1', tenantId: 't1' };
      },
    } as never,
    new TopicParserService(),
    {
      isEnabled() {
        return true;
      },
      async publishDownlinkCommand(input: PublishIotDownlinkCommandInput) {
        queued.push(input);
      },
      async publishUplink() {
        throw new Error('这个用例里 mq 模式不应触发上行发布');
      },
    } as IotMessagePublisherPort,
  );

  try {
    const result = await service.publish({
      vendor: 'emqx',
      deviceId: 'device-001',
      topicKind: BizIotTopicKind.CMD_RES,
      requestId: 'req-bridge-cmd-1',
      payload: {
        meta: {
          requestId: 'req-bridge-cmd-1',
          deviceId: 'device-001',
          timestamp: Date.now(),
          event: 'cmd.reboot',
          version: '1.0',
        },
        data: {
          command: 'reboot',
        },
      },
    });

    assert.equal(result.topic, 'v1/cmd/device-001/res');
    assert.equal(result.delivery, 'queued');
    assert.equal(queued.length, 1);
    assert.equal(saved.length >= 1, true);
    assert.equal(queued[0].requestId, 'req-bridge-cmd-1');
    assert.equal(queued[0].deviceId, 'device-001');
    assert.equal(queued[0].topic, 'v1/cmd/device-001/res');
    assert.equal(queued[0].provider, 'auto');
    assert.equal(queued[0].messageId, 'msg-1');
    assert.equal(queued[0].qos, undefined);
    assert.equal(queued[0].retain, false);
  } finally {
    if (previousUrl === undefined) {
      delete process.env.RABBITMQ_URL;
    } else {
      process.env.RABBITMQ_URL = previousUrl;
    }
  }
});

test('emqx + callback 模式下即使设置 RABBITMQ_URL 也不会启用 iot bridge rabbitmq', () => {
  const prevVendor = process.env.IOT_VENDOR;
  const prevMode = process.env.IOT_RECEIVE_MODE;
  const prevUrl = process.env.RABBITMQ_URL;
  process.env.IOT_VENDOR = 'emqx';
  process.env.IOT_RECEIVE_MODE = 'callback';
  process.env.RABBITMQ_URL = 'amqp://root:rd@127.0.0.1:5672/lumimax';
  try {
    assert.equal(shouldUseIotBridgeRabbitmq(), false);
  } finally {
    if (prevVendor === undefined) {
      delete process.env.IOT_VENDOR;
    } else {
      process.env.IOT_VENDOR = prevVendor;
    }
    if (prevMode === undefined) {
      delete process.env.IOT_RECEIVE_MODE;
    } else {
      process.env.IOT_RECEIVE_MODE = prevMode;
    }
    if (prevUrl === undefined) {
      delete process.env.RABBITMQ_URL;
    } else {
      process.env.RABBITMQ_URL = prevUrl;
    }
  }
});

test('iot bridge rabbitmq 使用 RABBITMQ_URL', () => {
  const previousGlobalUrl = process.env.RABBITMQ_URL;
  process.env.RABBITMQ_URL = 'amqp://root:rd@localhost:5672/lumimax';

  try {
    assert.equal(shouldUseIotBridgeRabbitmq(), true);
    assert.equal(
      resolveIotBridgeRabbitmqUrl(),
      'amqp://root:rd@127.0.0.1:5672/lumimax',
    );
  } finally {
    if (previousGlobalUrl === undefined) {
      delete process.env.RABBITMQ_URL;
    } else {
      process.env.RABBITMQ_URL = previousGlobalUrl;
    }
  }
});

test('resolveIotBridgeEventPattern 会把 lifecycle、event 和其他 v1 topic 映射到对应事件', () => {
  assert.equal(resolveIotBridgeEventPattern('emqx/client.connected/x'), 'iot.up.lifecycle');
  assert.equal(resolveIotBridgeEventPattern('v1/event/dev/req'), 'iot.up.event');
  assert.equal(resolveIotBridgeEventPattern('v1/status/dev/req'), 'iot.up.event');
});

test('iot bridge rabbitmq 会规范化 localhost 主机名', () => {
  const previousUrl = process.env.RABBITMQ_URL;
  process.env.RABBITMQ_URL = 'amqp://root:rd@localhost:5672/lumimax';

  try {
    assert.equal(
      resolveIotBridgeRabbitmqUrl(),
      'amqp://root:rd@127.0.0.1:5672/lumimax',
    );
  } finally {
    if (previousUrl === undefined) {
      delete process.env.RABBITMQ_URL;
    } else {
      process.env.RABBITMQ_URL = previousUrl;
    }
  }
});
