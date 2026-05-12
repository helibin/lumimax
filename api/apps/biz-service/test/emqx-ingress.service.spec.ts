import assert from 'node:assert/strict';
import test from 'node:test';
import { EmqxIngressService } from '../src/iot/bridge/emqx-ingress.service';

test('authenticate maps EMQX auth payload to allow response', async () => {
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
    {} as never,
  );

  const result = await service.authenticate({
    clientid: 'device-001',
    username: 'device-001',
    cert_fingerprint: 'AA:BB',
    request_id: 'req-auth-1',
  });

  assert.equal(result.result, 'allow');
  assert.equal(result.requestId, 'req-auth-1');
  assert.deepEqual(result.client_attrs, {
    deviceId: 'device-001',
    tenantId: 'tenant-001',
    deviceStatus: 'active',
    credentialStatus: 'active',
  });
});

test('authorize denies invalid acl action before validation', async () => {
  const service = new EmqxIngressService(
    {
      async validateAuthentication() {
        throw new Error('should not run');
      },
    } as never,
    {} as never,
  );

  const result = await service.authorize({
    clientid: 'device-001',
    topic: 'v1/event/device-001/req',
    action: 'unknown',
  });

  assert.equal(result.result, 'deny');
  assert.equal(result.reason, 'invalid_action');
});

test('webhook forwards parsed publish payload into existing ingest pipeline', async () => {
  const service = new EmqxIngressService(
    {
      async validateAuthentication() {
        throw new Error('should not run');
      },
    } as never,
    {
      async ingestCloudMessage(input: {
        vendor: string;
        topic: string;
        payloadJson: string;
        receivedAt: number;
        requestId: string;
      }) {
        assert.equal(input.vendor, 'emqx');
        assert.equal(input.topic, 'v1/event/device-001/req');
        assert.equal(input.requestId, 'req-publish-1');
        const payload = JSON.parse(input.payloadJson);
        assert.equal(payload.meta.deviceId, 'device-001');
        assert.equal(payload.meta.event, 'meal.record.create');
        return {
          success: true,
          message: 'ok',
          normalized: {
            requestId: input.requestId,
            topic: input.topic,
            topicKind: 'event.req',
            event: 'meal.record.create',
            deviceId: 'device-001',
            locale: 'zh-CN',
          },
        };
      },
    } as never,
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
});

test('webhook builds lifecycle topic when EMQX only posts connection event payload', async () => {
  const service = new EmqxIngressService(
    {
      async validateAuthentication() {
        throw new Error('should not run');
      },
    } as never,
    {
      async ingestCloudMessage(input: {
        topic: string;
        payloadJson: string;
      }) {
        assert.equal(input.topic, 'emqx/client.connected/device-009');
        const payload = JSON.parse(input.payloadJson);
        assert.equal(payload.event, 'client.connected');
        assert.equal(payload.clientid, 'device-009');
        return {
          success: true,
          message: 'ok',
          normalized: {
            requestId: 'ignored',
            topic: input.topic,
            topicKind: 'status.req',
            event: 'status.connected',
            deviceId: 'device-009',
            locale: 'en-US',
          },
        };
      },
    } as never,
  );

  const result = await service.webhook({
    event: 'client.connected',
    clientid: 'device-009',
    timestamp: 1710000000123,
  });

  assert.equal(result.ok, true);
});
