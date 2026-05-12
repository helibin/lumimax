import assert from 'node:assert/strict';
import test from 'node:test';
import { DeviceAccessValidationService } from '../src/device/devices/device-access-validation.service';

function createService(input?: {
  device?: Record<string, unknown> | null;
  credentials?: Array<Record<string, unknown>>;
}) {
  const device = input?.device ?? null;
  const credentials = input?.credentials ?? [];

  return new DeviceAccessValidationService(
    {
      async findOne(options: { where: Array<Record<string, unknown>> | Record<string, unknown> }) {
        if (!device) {
          return null;
        }
        const wheres = Array.isArray(options.where) ? options.where : [options.where];
        for (const where of wheres) {
          if (where.id && device.id !== where.id) {
            continue;
          }
          if (where.deviceSn && device.deviceSn !== where.deviceSn) {
            continue;
          }
          if (where.tenantId && device.tenantId !== where.tenantId) {
            continue;
          }
          return device;
        }
        return null;
      },
    } as never,
    {
      async findOne(options: {
        where: Record<string, unknown>;
        order?: Record<string, 'DESC' | 'ASC'>;
      }) {
        const where = options.where;
        return (
          credentials.find((item) => {
            for (const [key, value] of Object.entries(where)) {
              if ((item as Record<string, unknown>)[key] !== value) {
                return false;
              }
            }
            return true;
          }) ?? null
        );
      },
    } as never,
  );
}

test('validateAuthentication accepts active emqx device with matching fingerprint', async () => {
  const service = createService({
    device: {
      id: 'device-emqx-1',
      tenantId: 'tenant-1',
      provider: 'emqx',
      status: 'active',
    },
    credentials: [
      {
        tenantId: 'tenant-1',
        deviceId: 'device-emqx-1',
        vendor: 'emqx',
        status: 'active',
        credentialId: 'emqx-cert-1',
        fingerprint: 'aabbccdd',
      },
    ],
  });

  const result = await service.validateAuthentication({
    clientId: 'DEVICE-EMQX-1',
    deviceId: 'device-emqx-1',
    tenantId: 'tenant-1',
    vendor: 'emqx',
    certificateFingerprint: 'AA:BB:CC:DD',
  });

  assert.equal(result.allowed, true);
  assert.equal(result.deviceId, 'device-emqx-1');
  assert.equal(result.credentialId, 'emqx-cert-1');
});

test('validateAuthentication rejects mismatched clientId and deviceId', async () => {
  const service = createService();

  const result = await service.validateAuthentication({
    clientId: 'device-1',
    deviceId: 'device-2',
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'client_id_device_id_mismatch');
});

test('validateAuthentication rejects inactive device before checking credentials', async () => {
  const service = createService({
    device: {
      id: 'device-emqx-2',
      tenantId: 'tenant-1',
      provider: 'emqx',
      status: 'inactive',
    },
    credentials: [
      {
        tenantId: 'tenant-1',
        deviceId: 'device-emqx-2',
        vendor: 'emqx',
        status: 'active',
        credentialId: 'emqx-cert-2',
        fingerprint: 'ff00',
      },
    ],
  });

  const result = await service.validateAuthentication({
    clientId: 'device-emqx-2',
    tenantId: 'tenant-1',
    vendor: 'emqx',
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'device_inactive');
});

test('validateTopicAccess allows device publish on request topics and subscribe on downlink topics', async () => {
  const service = createService({
    device: {
      id: 'device-emqx-3',
      tenantId: 'tenant-1',
      provider: 'emqx',
      status: 'active',
    },
    credentials: [
      {
        tenantId: 'tenant-1',
        deviceId: 'device-emqx-3',
        vendor: 'emqx',
        status: 'active',
        credentialId: 'emqx-cert-3',
        fingerprint: '1234',
      },
    ],
  });

  const publishResult = await service.validateTopicAccess({
    clientId: 'device-emqx-3',
    tenantId: 'tenant-1',
    vendor: 'emqx',
    action: 'publish',
    topic: 'v1/event/device-emqx-3/req',
  });
  const subscribeResult = await service.validateTopicAccess({
    clientId: 'device-emqx-3',
    tenantId: 'tenant-1',
    vendor: 'emqx',
    action: 'subscribe',
    topic: 'v1/cmd/device-emqx-3/res',
  });

  assert.equal(publishResult.allowed, true);
  assert.equal(publishResult.topicKind, 'event.req');
  assert.equal(subscribeResult.allowed, true);
  assert.equal(subscribeResult.topicKind, 'cmd.res');
});

test('validateTopicAccess rejects device publish to platform downlink topic', async () => {
  const service = createService({
    device: {
      id: 'device-emqx-4',
      tenantId: 'tenant-1',
      provider: 'emqx',
      status: 'active',
    },
    credentials: [
      {
        tenantId: 'tenant-1',
        deviceId: 'device-emqx-4',
        vendor: 'emqx',
        status: 'active',
        credentialId: 'emqx-cert-4',
        fingerprint: '5678',
      },
    ],
  });

  const result = await service.validateTopicAccess({
    clientId: 'device-emqx-4',
    tenantId: 'tenant-1',
    vendor: 'emqx',
    action: 'publish',
    topic: 'v1/cmd/device-emqx-4/res',
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'topic_action_not_allowed');
});

test('validateTopicAccess rejects topic deviceId mismatch after parser normalization', async () => {
  const service = createService({
    device: {
      id: 'device-emqx-5',
      tenantId: 'tenant-1',
      provider: 'emqx',
      status: 'active',
    },
    credentials: [
      {
        tenantId: 'tenant-1',
        deviceId: 'device-emqx-5',
        vendor: 'emqx',
        status: 'active',
        credentialId: 'emqx-cert-5',
        fingerprint: '9999',
      },
    ],
  });

  const result = await service.validateTopicAccess({
    clientId: 'device-emqx-5',
    tenantId: 'tenant-1',
    vendor: 'emqx',
    action: 'subscribe',
    topic: 'v1/cmd/device-emqx-6/req',
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'topic_device_id_mismatch');
});
