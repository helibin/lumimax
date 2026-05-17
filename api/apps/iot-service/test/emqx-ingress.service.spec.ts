import assert from 'node:assert/strict';
import { afterEach, beforeEach } from 'node:test';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import { EmqxIngressAdapterService } from '@lumimax/iot-kit';
import { EmqxIngressService } from '../src/ingress/emqx-ingress.service';
import type { IotMessagePublisherPort } from '../src/transport/iot-message-publisher.port';

let savedIoMode: string | undefined;

beforeEach(() => {
  savedIoMode = process.env.IOT_RECEIVE_MODE;
  process.env.IOT_RECEIVE_MODE = 'callback';
});

afterEach(() => {
  if (savedIoMode === undefined) {
    delete process.env.IOT_RECEIVE_MODE;
  } else {
    process.env.IOT_RECEIVE_MODE = savedIoMode;
  }
});

test('authenticate 会把 EMQX 鉴权请求映射为允许响应', async () => {
  const service = new EmqxIngressService(
    {
      async validateAuthentication(input: Record<string, unknown>) {
        assert.equal(input.clientId, 'device-001');
        assert.equal(input.deviceId, 'device-001');
        assert.equal(input.certificateFingerprint, 'AA:BB');
        return {
          allowed: true,
          deviceId: 'device-001',
          tenantId: 'tenant-001',
          deviceStatus: 'active',
          credentialStatus: 'active',
        };
      },
    } as never,
    { warn() {}, debug() {}, info() {}, error() {} } as never,
    { isEnabled() { return true; }, async publishUplink() {}, async publishDownlinkCommand() {} } as IotMessagePublisherPort,
    {} as never,
  );

  const result = await service.authenticate({
    clientid: 'device-001',
    username: 'device-001',
    cert_fingerprint: 'AA:BB',
    request_id: 'req-auth-1',
  });

  assert.equal(result.result, 'allow');
  assert.equal(result.is_superuser, false);
  assert.deepEqual(result.client_attrs, {
    deviceId: 'device-001',
    tenantId: 'tenant-001',
    deviceStatus: 'active',
    credentialStatus: 'active',
  });
});

test('authorize 会在校验前拒绝非法 ACL 动作', async () => {
  const service = new EmqxIngressService(
    {
      async validateAuthentication() {
        throw new Error('这里不应该执行到设备鉴权');
      },
    } as never,
    { warn() {}, debug() {}, info() {}, error() {} } as never,
    { isEnabled() { return true; }, async publishUplink() {}, async publishDownlinkCommand() {} } as IotMessagePublisherPort,
    {} as never,
  );

  const result = await service.authorize({
    clientid: 'device-001',
    topic: 'v1/event/device-001/req',
    action: 'unknown',
  });

  assert.equal(result.result, 'deny');
});

test('webhook 会把解析后的发布载荷转发到 rabbitmq bridge', async () => {
  const queued: Array<Record<string, unknown>> = [];
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
      async publishUplink(input: {
        vendor: string;
        topic: string;
        payload: Record<string, unknown>;
        receivedAt: number;
        requestId: string;
      }) {
        queued.push(input);
        assert.equal(input.vendor, 'emqx');
        assert.equal(input.topic, 'v1/event/device-001/req');
        assert.equal(input.requestId, 'req-publish-1');
        const payload = input.payload as {
          meta: { deviceId: string; event: string };
        };
        assert.equal(payload.meta.deviceId, 'device-001');
        assert.equal(payload.meta.event, 'meal.record.create');
      },
      async publishDownlinkCommand() {},
    } as IotMessagePublisherPort,
    new EmqxIngressAdapterService() as never,
  );

  const result = await service.webhook({
    event: 'message.publish',
    topic: 'v1/event/device-001/req',
    request_id: 'req-publish-1',
    payload: JSON.stringify({
      meta: {
        requestId: 'req-publish-1',
        deviceId: 'device-001',
        timestamp: 1710000000000,
        event: 'meal.record.create',
        version: '1.0',
        locale: 'zh-CN',
      },
      data: {
        mealRecordId: 'meal-001',
      },
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.success, true);
  assert.equal(result.queued, true);
  assert.equal(queued.length, 1);
});

test('webhook 会在 EMQX 只上报连接事件时补出生命周期 topic', async () => {
  const queued: Array<Record<string, unknown>> = [];
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
      async publishUplink(input: {
        topic: string;
        payload: Record<string, unknown>;
      }) {
        queued.push(input);
        assert.equal(input.topic, 'emqx/client.connected/device-009');
        const payload = input.payload as {
          event: string;
          clientid: string;
        };
        assert.equal(payload.event, 'client.connected');
        assert.equal(payload.clientid, 'device-009');
      },
      async publishDownlinkCommand() {},
    } as IotMessagePublisherPort,
    new EmqxIngressAdapterService() as never,
  );

  const result = await service.webhook({
    event: 'client.connected',
    clientid: 'device-009',
    timestamp: 1710000000123,
  });

  assert.equal(result.ok, true);
  assert.equal(queued.length, 1);
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

test('authenticate 会在 EMQX_MQTT_PASSWORD 匹配时放行 iot-service MQTT 客户端', async () => {
  const prevPass = process.env.EMQX_MQTT_PASSWORD;
  const prevUser = process.env.EMQX_MQTT_USERNAME;
  process.env.EMQX_MQTT_PASSWORD = 'downlink-shared-secret';
  delete process.env.EMQX_MQTT_USERNAME;
  try {
    const service = new EmqxIngressService(
      {
        async validateAuthentication() {
          throw new Error('broker 客户端不应走设备鉴权');
        },
      } as never,
      { warn() {}, debug() {}, info() {}, error() {} } as never,
      { isEnabled() { return true; }, async publishUplink() {}, async publishDownlinkCommand() {} } as IotMessagePublisherPort,
      {} as never,
    );

    const result = await service.authenticate({
      clientid: 'lumimax-iot-service-11111111-1111-4111-8111-111111111111',
      password: 'downlink-shared-secret',
    });

    assert.equal(result.result, 'allow');
    assert.equal(result.is_superuser, true);
    assert.deepEqual(result.client_attrs, {});
  } finally {
    restoreEnv('EMQX_MQTT_PASSWORD', prevPass);
    restoreEnv('EMQX_MQTT_USERNAME', prevUser);
  }
});

test('authenticate 会在密码不匹配时拒绝 broker 下行客户端', async () => {
  const prevPass = process.env.EMQX_MQTT_PASSWORD;
  process.env.EMQX_MQTT_PASSWORD = 'secret-a';
  try {
    const service = new EmqxIngressService(
      {
        async validateAuthentication() {
          return { allowed: false, deviceId: null, tenantId: null, reason: 'device_not_found' };
        },
      } as never,
      { warn() {}, debug() {}, info() {}, error() {} } as never,
      { isEnabled() { return true; }, async publishUplink() {}, async publishDownlinkCommand() {} } as IotMessagePublisherPort,
      {} as never,
    );

    const result = await service.authenticate({
      clientid: 'lumimax-biz-22222222-2222-4222-8222-222222222222',
      password: 'wrong',
    });

    assert.equal(result.result, 'deny');
    assert.equal(result.is_superuser, false);
  } finally {
    restoreEnv('EMQX_MQTT_PASSWORD', prevPass);
  }
});

test('authorize 会在未显式配置 EMQX_MQTT_USERNAME 时默认放行 lumimax_iot 共享订阅客户端', async () => {
  const prevUser = process.env.EMQX_MQTT_USERNAME;
  delete process.env.EMQX_MQTT_USERNAME;
  try {
    const service = new EmqxIngressService(
      {
        async validateAuthentication() {
          throw new Error('这里不应该执行到设备鉴权');
        },
        async validateTopicAccess() {
          return {
            allowed: false,
            reason: 'client_not_recognized',
          };
        },
      } as never,
      { warn() {}, debug() {}, info() {}, error() {} } as never,
      { isEnabled() { return true; }, async publishUplink() {}, async publishDownlinkCommand() {} } as IotMessagePublisherPort,
      {} as never,
    );

    const result = await service.authorize({
      clientid: 'lumimax_iot',
      username: 'lumimax_iot',
      topic: 'v1/event/some-device/req',
      action: 'subscribe',
    });

    assert.equal(result.result, 'allow');
    assert.equal(result.is_superuser, false);
  } finally {
    restoreEnv('EMQX_MQTT_USERNAME', prevUser);
  }
});

test('authorize 会允许 iot-service 客户端向 v1/+/+/res publish', async () => {
  const service = new EmqxIngressService(
    {
      async validateAuthentication() {
        throw new Error('这里不应该执行到设备鉴权');
      },
    } as never,
    { warn() {}, debug() {}, info() {}, error() {} } as never,
    { isEnabled() { return true; }, async publishUplink() {}, async publishDownlinkCommand() {} } as IotMessagePublisherPort,
    {} as never,
  );

  const result = await service.authorize({
    clientid: 'lumimax-iot-service-33333333-3333-4333-8333-333333333333',
    topic: 'v1/event/some-device/res',
    action: 'publish',
  });

  assert.equal(result.result, 'allow');
  assert.equal(result.is_superuser, false);
});

test('authorize 会允许 iot-service 客户端订阅 $share 共享 topic', async () => {
  const prevGroup = process.env.EMQX_SHARED_SUBSCRIPTION_GROUP;
  process.env.EMQX_SHARED_SUBSCRIPTION_GROUP = 'lumimax-iot';
  try {
    const service = new EmqxIngressService(
      {
        async validateAuthentication() {
          throw new Error('这里不应该执行到设备鉴权');
        },
        async validateTopicAccess() {
          return {
            allowed: false,
            reason: 'client_not_recognized',
          };
        },
      } as never,
      { warn() {}, debug() {}, info() {}, error() {} } as never,
      { isEnabled() { return true; }, async publishUplink() {}, async publishDownlinkCommand() {} } as IotMessagePublisherPort,
      {} as never,
    );

    const result = await service.authorize({
      clientid: 'lumimax-iot-service-44444444-4444-4444-8444-444444444444',
      topic: '$share/lumimax-iot/v1/event/some-device/req',
      action: 'subscribe',
    });

    assert.equal(result.result, 'allow');
    assert.equal(result.is_superuser, false);
  } finally {
    restoreEnv('EMQX_SHARED_SUBSCRIPTION_GROUP', prevGroup);
  }
});

test('authorize 会允许 EMQX 传入去掉 $share 前缀后的共享订阅 topic', async () => {
  const prevUser = process.env.EMQX_MQTT_USERNAME;
  process.env.EMQX_MQTT_USERNAME = 'lumimax_iot';
  try {
    const service = new EmqxIngressService(
      {
        async validateAuthentication() {
          throw new Error('这里不应该执行到设备鉴权');
        },
        async validateTopicAccess() {
          return {
            allowed: false,
            reason: 'client_not_recognized',
          };
        },
      } as never,
      { warn() {}, debug() {}, info() {}, error() {} } as never,
      { isEnabled() { return true; }, async publishUplink() {}, async publishDownlinkCommand() {} } as IotMessagePublisherPort,
      {} as never,
    );

    const result = await service.authorize({
      clientid: 'lumimax-iot-service-12121212-1212-4212-8212-121212121212',
      username: 'lumimax_iot',
      cert_common_name: 'lumimax_iot',
      topic: 'v1/event/some-device/req',
      action: 'subscribe',
    });

    assert.equal(result.result, 'allow');
    assert.equal(result.is_superuser, false);
  } finally {
    restoreEnv('EMQX_MQTT_USERNAME', prevUser);
  }
});

test('authorize 会允许 iot-service X.509 客户端订阅 $share 共享 topic', async () => {
  const prevGroup = process.env.EMQX_SHARED_SUBSCRIPTION_GROUP;
  const prevUser = process.env.EMQX_MQTT_USERNAME;
  process.env.EMQX_SHARED_SUBSCRIPTION_GROUP = 'lumimax-iot';
  process.env.EMQX_MQTT_USERNAME = 'lumimax_iot';
  try {
    const service = new EmqxIngressService(
      {
        async validateAuthentication() {
          throw new Error('这里不应该执行到设备鉴权');
        },
        async validateTopicAccess() {
          return {
            allowed: false,
            reason: 'client_not_recognized',
          };
        },
      } as never,
      { warn() {}, debug() {}, info() {}, error() {} } as never,
      { isEnabled() { return true; }, async publishUplink() {}, async publishDownlinkCommand() {} } as IotMessagePublisherPort,
      {} as never,
    );

    const result = await service.authorize({
      clientid: 'lumimax_iot',
      username: 'lumimax_iot',
      cert_common_name: 'lumimax_iot',
      topic: '$share/lumimax-iot/v1/event/some-device/req',
      action: 'subscribe',
    });

    assert.equal(result.result, 'allow');
    assert.equal(result.is_superuser, false);
  } finally {
    restoreEnv('EMQX_SHARED_SUBSCRIPTION_GROUP', prevGroup);
    restoreEnv('EMQX_MQTT_USERNAME', prevUser);
  }
});

test('authorize 会在 username 命中 EMQX_MQTT_USERNAME 时放行内部共享订阅客户端', async () => {
  const prevUser = process.env.EMQX_MQTT_USERNAME;
  process.env.EMQX_MQTT_USERNAME = 'lumimax_iot';
  try {
    const service = new EmqxIngressService(
      {
        async validateAuthentication() {
          throw new Error('这里不应该执行到设备鉴权');
        },
        async validateTopicAccess() {
          return {
            allowed: false,
            reason: 'client_not_recognized',
          };
        },
      } as never,
      { warn() {}, debug() {}, info() {}, error() {} } as never,
      { isEnabled() { return true; }, async publishUplink() {}, async publishDownlinkCommand() {} } as IotMessagePublisherPort,
      {} as never,
    );

    const result = await service.authorize({
      clientid: 'unexpected-client-id',
      username: 'lumimax_iot',
      topic: 'v1/event/some-device/req',
      action: 'subscribe',
    });

    assert.equal(result.result, 'allow');
    assert.equal(result.is_superuser, false);
  } finally {
    restoreEnv('EMQX_MQTT_USERNAME', prevUser);
  }
});

test('authorize 会拒绝 iot-service 客户端订阅非共享 req topic', async () => {
  const service = new EmqxIngressService(
    {
      async validateAuthentication() {
        throw new Error('这里不应该执行到设备鉴权');
      },
    } as never,
    { warn() {}, debug() {}, info() {}, error() {} } as never,
    { isEnabled() { return true; }, async publishUplink() {}, async publishDownlinkCommand() {} } as IotMessagePublisherPort,
    {} as never,
  );

  const result = await service.authorize({
    clientid: 'lumimax-iot-service-44444444-4444-4444-8444-444444444444',
    topic: 'v1/event/some-device/req',
    action: 'subscribe',
  });

  assert.equal(result.result, 'deny');
});

test('authorize 会拒绝冒充 iot-service 的 X.509 客户端', async () => {
  const prevUser = process.env.EMQX_MQTT_USERNAME;
  process.env.EMQX_MQTT_USERNAME = 'lumimax_iot';
  try {
    const service = new EmqxIngressService(
      {
        async validateAuthentication() {
          throw new Error('这里不应该执行到设备鉴权');
        },
        async validateTopicAccess() {
          return {
            allowed: false,
            reason: 'client_not_recognized',
          };
        },
      } as never,
      { warn() {}, debug() {}, info() {}, error() {} } as never,
      { isEnabled() { return true; }, async publishUplink() {}, async publishDownlinkCommand() {} } as IotMessagePublisherPort,
      {} as never,
    );

    const result = await service.authorize({
      clientid: 'device-001',
      username: 'device-001',
      cert_common_name: 'device-001',
      topic: '$share/lumimax-iot/v1/event/some-device/req',
      action: 'subscribe',
    });

    assert.equal(result.result, 'deny');
  } finally {
    restoreEnv('EMQX_MQTT_USERNAME', prevUser);
  }
});

test('authorize 会拒绝 iot-service 客户端向 req topic publish', async () => {
  const service = new EmqxIngressService(
    {
      async validateAuthentication() {
        throw new Error('这里不应该执行到设备鉴权');
      },
    } as never,
    { warn() {}, debug() {}, info() {}, error() {} } as never,
    { isEnabled() { return true; }, async publishUplink() {}, async publishDownlinkCommand() {} } as IotMessagePublisherPort,
    {} as never,
  );

  const result = await service.authorize({
    clientid: 'lumimax-iot-service-55555555-5555-4555-8555-555555555555',
    topic: 'v1/event/some-device/req',
    action: 'publish',
  });

  assert.equal(result.result, 'deny');
});

test('ingest 会在 EMQX mq 模式禁用 HTTP 上行时抛出 Conflict', async () => {
  const prevVendor = process.env.IOT_VENDOR;
  const prevMode = process.env.IOT_RECEIVE_MODE;
  try {
    process.env.IOT_VENDOR = 'emqx';
    process.env.IOT_RECEIVE_MODE = 'mq';
    const service = new EmqxIngressService(
      {} as never,
      { warn() {}, debug() {}, info() {}, error() {} } as never,
      { isEnabled() { return true; }, async publishUplink() {}, async publishDownlinkCommand() {} } as IotMessagePublisherPort,
      {} as never,
    );
    await assert.rejects(
      () => service.ingest({ event: 'message.publish' }),
      (err: unknown) => err instanceof ConflictException,
    );
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
  }
});
