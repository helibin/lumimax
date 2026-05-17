import assert from 'node:assert/strict';
import test from 'node:test';
import { EmqxIngressAdapterService } from '@lumimax/iot-kit';
import { EmqxIngressService } from '../src/ingress/emqx-ingress.service';
import type {
  IotMessagePublisherPort,
  PublishIotUplinkInput,
} from '../src/transport/iot-message-publisher.port';

test('启用后 emqx ingress 会通过 rabbitmq bridge 对上行消息入队', async () => {
  const prevMode = process.env.IOT_RECEIVE_MODE;
  process.env.IOT_RECEIVE_MODE = 'callback';
  const queued: PublishIotUplinkInput[] = [];
  const service = new EmqxIngressService(
    {
      async validateAuthentication() {
        throw new Error('这里不应该执行到设备鉴权');
      },
    } as never,
    { warn() {}, debug() {}, info() {}, error() {} } as never,
    {
      isEnabled() {
        return true;
      },
      async publishUplink(input: PublishIotUplinkInput) {
        queued.push(input);
      },
      async publishDownlinkCommand() {},
    } as IotMessagePublisherPort,
    new EmqxIngressAdapterService(),
  );

  const result = await service.ingest({
    topic: 'v1/event/device-001/req',
    request_id: 'req-bridge-1',
    payload: {
      meta: {
        requestId: 'req-bridge-1',
        deviceId: 'device-001',
        event: 'meal.record.create',
      },
      data: {
        mealRecordId: 'meal-001',
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.queued, true);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].requestId, 'req-bridge-1');
  assert.equal(queued[0].topic, 'v1/event/device-001/req');
  if (prevMode === undefined) {
    delete process.env.IOT_RECEIVE_MODE;
  } else {
    process.env.IOT_RECEIVE_MODE = prevMode;
  }
});
