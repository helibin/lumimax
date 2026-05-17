import assert from 'node:assert/strict';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { DeviceApplicationService } from '../src/device/devices/device-application.service';
import { decryptDeviceCredentialSecret, encryptDeviceCredentialSecret } from '@lumimax/security';

type DeviceRow = {
  id: string;
  deviceSn: string;
  productKey: string;
  provider: string;
  status: string;
  onlineStatus: string;
  boundUserId?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type QueryBuilderState = {
  andWhereClauses: string[];
  skipValue: number;
  takeValue: number;
  whereClause: string | null;
  whereParams: Record<string, unknown>;
};

function createDeviceRepositoryForList(items: DeviceRow[]) {
  const state: QueryBuilderState = {
    andWhereClauses: [],
    skipValue: 0,
    takeValue: 0,
    whereClause: null,
    whereParams: {},
  };
  const qb = {
    where(clause: string, params: Record<string, unknown>) {
      state.whereClause = clause;
      state.whereParams = params;
      return qb;
    },
    andWhere(clause: string, _params?: Record<string, unknown>) {
      state.andWhereClauses.push(clause);
      return qb;
    },
    orderBy() {
      return qb;
    },
    skip(value: number) {
      state.skipValue = value;
      return qb;
    },
    take(value: number) {
      state.takeValue = value;
      return qb;
    },
    async getManyAndCount() {
      return [items, items.length] as const;
    },
  };
  return {
    state,
    repository: {
      createQueryBuilder() {
        return qb;
      },
      async exist() {
        return false;
      },
      async findOne() {
        return null;
      },
      create(input: Record<string, unknown>) {
        return input;
      },
      async save(input: Record<string, unknown>) {
        return input;
      },
      async delete() {
        return;
      },
      async softDelete() {
        return;
      },
      async count() {
        return 0;
      },
    },
  };
}

function createService(deviceRepository: Record<string, unknown>) {
  return new DeviceApplicationService(
    deviceRepository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      appendBinding: async () => undefined,
      closeActiveBinding: async () => undefined,
      closeActiveBindings: async () => undefined,
      deleteAllBindings: async () => undefined,
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      async provisionOnDeviceCreated() {
        return { ok: true };
      },
    } as never,
  );
}

test('devices.list applies filters and caps pageSize', async () => {
  const now = new Date('2026-05-01T00:00:00.000Z');
  const { repository, state } = createDeviceRepositoryForList([
    {
      id: '01h0000000000000000000301',
      deviceSn: 'SN-001',
      productKey: 'smart-scale',
      provider: 'aws',
      status: 'active',
      onlineStatus: 'online',
      boundUserId: '01h0000000000000000000001',
      createdAt: now,
      updatedAt: now,
    },
  ]);
  const service = createService(repository);

  await service.execute({
    operation: 'devices.list',
    query: {
      keyword: 'SN-001',
      onlineStatus: 'online',
      page: -2,
      pageSize: 1000,
      provider: 'aws',
      status: 'active',
    },
    user: { userId: '01h0000000000000000000001', type: 0 },
    tenantScope: '01h0000000000000000000011',
    requestId: '01h0000000000000000000101',
  });

  assert.equal(state.whereClause, 'device.tenantId = :tenantId');
  assert.equal(state.whereParams.tenantId, '01h0000000000000000000011');
  assert.equal(
    state.andWhereClauses.some((clause) => clause.includes('device.boundUserId = :boundUserId')),
    true,
  );
  assert.equal(
    state.andWhereClauses.some((clause) => clause.includes('device.deviceSn ILIKE')),
    true,
  );
  assert.equal(
    state.andWhereClauses.some((clause) => clause.includes('device.status = :status')),
    true,
  );
  assert.equal(
    state.andWhereClauses.some((clause) => clause.includes('device.onlineStatus = :onlineStatus')),
    true,
  );
  assert.equal(
    state.andWhereClauses.some((clause) => clause.includes('device.provider = :provider')),
    true,
  );
  assert.equal(state.skipValue, 0);
  assert.equal(state.takeValue, 100);
});

test('admin.devices.list supports filtering unbound devices', async () => {
  const now = new Date('2026-05-01T00:00:00.000Z');
  const { repository, state } = createDeviceRepositoryForList([
    {
      id: '01h0000000000000000000302',
      deviceSn: 'SN-002',
      productKey: 'smart-scale',
      provider: 'aws',
      status: 'inactive',
      onlineStatus: 'offline',
      boundUserId: null,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  const service = createService(repository);

  await service.execute({
    operation: 'admin.devices.list',
    query: { boundUserId: null },
    tenantScope: '01h0000000000000000000011',
    requestId: '01h0000000000000000000102',
  });

  assert.equal(state.whereClause, 'device.tenantId = :tenantId');
  assert.equal(
    state.andWhereClauses.some((clause) => clause.includes('device.boundUserId IS NULL')),
    true,
  );
});

test('admin.devices.create reuses existing active device for duplicate deviceSn', async () => {
  let provisionCalls = 0;
  const service = createService({
    createQueryBuilder() {
      throw new Error('not used in this test');
    },
    async findOne() {
      return {
        id: '01h0000000000000000000309',
        tenantId: '01h0000000000000000000011',
        deviceSn: 'SN-DUPLICATED',
        productKey: 'smart-scale',
        provider: 'emqx',
        status: 'active',
        onlineStatus: 'offline',
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        updatedAt: new Date('2026-05-01T00:00:00.000Z'),
        deletedAt: null,
      };
    },
    create(input: Record<string, unknown>) {
      return input;
    },
    async save(input: Record<string, unknown>) {
      return input;
    },
    async delete() {
      return;
    },
    async softDelete() {
      return;
    },
    async count() {
      return 0;
    },
  });

  (service as any).deviceIdentityService = {
    async provisionOnDeviceCreated() {
      provisionCalls += 1;
      return { ok: true };
    },
  };

  const result = await service.execute({
    operation: 'admin.devices.create',
    body: { deviceSn: 'SN-DUPLICATED' },
    tenantScope: '01h0000000000000000000011',
    requestId: '01h0000000000000000000103',
  });

  assert.equal((result as Record<string, any>).deviceSn, 'SN-DUPLICATED');
  assert.equal((result as Record<string, any>).iotProvision?.skipped, true);
  assert.equal((result as Record<string, any>).iotProvision?.status, 'existing');
  assert.equal(provisionCalls, 0);
});

test('admin.devices.create updates reused device when provider changed and reprovisions iot', async () => {
  let provisionCalls = 0;
  const savedSnapshots: Array<Record<string, unknown>> = [];
  const service = createService({
    createQueryBuilder() {
      throw new Error('not used in this test');
    },
    async findOne() {
      return {
        id: '01h0000000000000000000310',
        tenantId: '01h0000000000000000000011',
        name: 'legacy-device',
        deviceSn: 'SN-EMQX-UPGRADE',
        productKey: 'smart-scale',
        provider: 'aws',
        status: 'inactive',
        onlineStatus: 'offline',
        boundUserId: null,
        locale: 'en-US',
        market: 'US',
        lastSeenAt: new Date('2026-04-01T00:00:00.000Z'),
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        updatedAt: new Date('2026-04-01T00:00:00.000Z'),
        deletedAt: null,
      };
    },
    create(input: Record<string, unknown>) {
      return input;
    },
    async save(input: Record<string, unknown>) {
      savedSnapshots.push({ ...input });
      return input;
    },
    async delete() {
      throw new Error('should not delete existing device');
    },
    async softDelete() {
      return;
    },
    async count() {
      return 0;
    },
  });

  (service as any).deviceIdentityService = {
    async provisionOnDeviceCreated(input: Record<string, unknown>) {
      provisionCalls += 1;
      assert.equal(input.provider, 'emqx');
      return { ok: true, vendor: 'emqx', thingName: '01h0000000000000000000310' };
    },
  };

  const result = await service.execute({
    operation: 'admin.devices.create',
    body: { deviceSn: 'SN-EMQX-UPGRADE', name: 'emqx-device' },
    tenantScope: '01h0000000000000000000011',
    requestId: '01h0000000000000000000104',
  });

  assert.equal(provisionCalls, 1);
  assert.equal(savedSnapshots.length, 1);
  assert.equal(savedSnapshots[0]?.provider, 'emqx');
  assert.equal(savedSnapshots[0]?.status, 'active');
  assert.equal(savedSnapshots[0]?.name, 'emqx-device');
  assert.equal((result as Record<string, any>).provider, 'emqx');
  assert.equal((result as Record<string, any>).iotProvision?.vendor, 'emqx');
});

test('admin.devices.provision triggers IoT credential provisioning when local credential is missing', async () => {
  const now = new Date('2026-05-01T10:00:00.000Z');
  const calls: Array<Record<string, unknown>> = [];
  const service = new DeviceApplicationService(
    {
      async findOne({ where }: { where: { id?: string; tenantId?: string } }) {
        if (where.id === 'device-emqx-1' && where.tenantId === 'tenant-1') {
          return {
            id: 'device-emqx-1',
            tenantId: 'tenant-1',
            deviceSn: 'SN-EMQX-1',
            productKey: 'smart-scale',
            provider: 'emqx',
            status: 'inactive',
            onlineStatus: 'offline',
            createdAt: now,
            updatedAt: now,
          };
        }
        return null;
      },
      async save(input: Record<string, unknown>) {
        return {
          ...input,
          updatedAt: now,
        };
      },
    } as never,
    {} as never,
    {
      async findOne() {
        return null;
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { appendBinding: async () => undefined, closeActiveBinding: async () => undefined } as never,
    {} as never,
    { appendStatusLog: async () => undefined } as never,
    {} as never,
    {} as never,
    {
      async provisionOnDeviceCreated(input: Record<string, unknown>) {
        calls.push(input);
        return { ok: true, vendor: 'emqx', status: 'active' };
      },
      async rotateDeviceCredential() {
        throw new Error('should not rotate');
      },
    } as never,
  );

  const result = await service.execute<Record<string, unknown>>({
    operation: 'admin.devices.provision',
    params: { id: 'device-emqx-1' },
    tenantScope: 'tenant-1',
    requestId: 'req-provision-1',
  });

  assert.equal(result.provisioned, true);
  assert.equal((result.iotProvision as Record<string, unknown>).vendor, 'emqx');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].trigger, 'admin.devices.provision');
});

test('admin.devices.delete passes emqx vendor through cloud cleanup request', async () => {
  const now = new Date('2026-05-01T10:05:00.000Z');
  const deleteCalls: Array<Record<string, unknown>> = [];
  const deleteRepo = {
    async delete() {
      return;
    },
  };
  const service = new DeviceApplicationService(
    {
      async findOne({ where }: { where: { id?: string; tenantId?: string } }) {
        if (where.id === 'device-emqx-2' && where.tenantId === 'tenant-1') {
          return {
            id: 'device-emqx-2',
            tenantId: 'tenant-1',
            deviceSn: 'SN-EMQX-2',
            productKey: 'smart-scale',
            provider: 'emqx',
            status: 'active',
            onlineStatus: 'online',
            createdAt: now,
            updatedAt: now,
          };
        }
        return null;
      },
      async delete() {
        return;
      },
    } as never,
    deleteRepo as never,
    deleteRepo as never,
    deleteRepo as never,
    deleteRepo as never,
    deleteRepo as never,
    deleteRepo as never,
    deleteRepo as never,
    {
      appendBinding: async () => undefined,
      closeActiveBinding: async () => undefined,
      deleteAllBindings: async () => undefined,
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      async deleteDeviceIdentity(input: Record<string, unknown>) {
        deleteCalls.push(input);
        return { ok: true, vendor: input.vendor };
      },
    } as never,
  );

  const result = await service.execute<Record<string, unknown>>({
    operation: 'admin.devices.delete',
    params: { id: 'device-emqx-2' },
    tenantScope: 'tenant-1',
    requestId: 'req-delete-1',
  });

  assert.equal(result.ok, true);
  assert.equal(deleteCalls.length, 1);
  assert.equal(deleteCalls[0].vendor, 'emqx');
});

test('admin.devices.credential.get returns unavailable when local credential is missing', async () => {
  const now = new Date('2026-05-01T08:00:00.000Z');
  const service = new DeviceApplicationService(
    {
      async findOne({ where }: { where: { id?: string; tenantId?: string } }) {
        if (
          where.id === '01h0000000000000000000301'
          && where.tenantId === '01h0000000000000000000011'
        ) {
          return {
            id: '01h0000000000000000000301',
            tenantId: '01h0000000000000000000011',
            deviceSn: 'SN-1001',
            productKey: 'smart-scale',
            provider: 'aws',
            status: 'active',
            onlineStatus: 'online',
            createdAt: now,
            updatedAt: now,
          };
        }
        return null;
      },
    } as never,
    {} as never,
    {
      async findOne() {
        return null;
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      async provisionOnDeviceCreated() {
        return { ok: true };
      },
    } as never,
  );

  const result = await service.execute<Record<string, unknown>>({
    operation: 'admin.devices.credential.get',
    params: { id: '01h0000000000000000000301' },
    tenantScope: '01h0000000000000000000011',
    requestId: '01h0000000000000000000104',
  });

  assert.equal(result.available, false);
  assert.equal(result.source, 'unavailable');
  assert.equal(result.thingName, null);
  assert.equal(result.certificateArn, null);
});

test('internal.devices.applyAttrResult does not update shadow when result failed', async () => {
  let shadowFindCount = 0;
  let shadowSaveCount = 0;
  let statusLogCount = 0;
  const service = new DeviceApplicationService(
    {
      async findOne() {
        return {
          id: 'device-001',
          tenantId: 'tenant-001',
          deviceSn: 'sn-001',
          provider: 'aws',
        };
      },
    } as never,
    {} as never,
    {} as never,
    {
      async findOne() {
        shadowFindCount += 1;
        return null;
      },
      create(input: Record<string, unknown>) {
        return input;
      },
      async save(input: Record<string, unknown>) {
        shadowSaveCount += 1;
        return input;
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      async appendStatusLog() {
        statusLogCount += 1;
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const result = await service.execute<Record<string, unknown>>({
    operation: 'internal.devices.applyAttrResult',
    body: {
      deviceId: 'device-001',
      code: 50000,
      msg: 'failed',
      applied: {
        heartbeatInterval: 60,
      },
    },
    requestId: '01h0000000000000000000601',
  });

  assert.equal(result.code, 50000);
  assert.equal(result.msg, 'failed');
  assert.deepEqual(result.applied, {});
  assert.equal(result.reported, null);
  assert.equal(result.desired, null);
  assert.equal(shadowFindCount, 0);
  assert.equal(shadowSaveCount, 0);
  assert.equal(statusLogCount, 1);
});

test('admin.devices.credential.download decrypts stored secrets and returns archive payload', async () => {
  const previousKey = process.env.AES_KEY;
  process.env.AES_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const now = new Date('2026-05-01T09:00:00.000Z');
  const certificatePem = '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----';
  const privateKeyPem = '-----BEGIN PRIVATE KEY-----\nxyz\n-----END PRIVATE KEY-----';
  try {
    const storedCredential: Record<string, unknown> = {
      tenantId: '01h0000000000000000000011',
      deviceId: '01h0000000000000000000401',
      vendor: 'aws',
      credentialType: 'certificate',
      credentialId: 'cert-2001',
      thingName: 'thing-2001',
      certificateArn: 'arn:aws:iot:ap-southeast-1:123:cert/xyz',
      certificatePem: encryptDeviceCredentialSecret(certificatePem),
      privateKeyPem: encryptDeviceCredentialSecret(privateKeyPem),
      endpoint: 'iot.example.com',
      region: 'ap-southeast-1',
      fingerprint: 'fp',
      status: 'active',
      issuedAt: now,
      expiresAt: null,
      metadataJson: null,
      updatedAt: now,
    };
    const service = new DeviceApplicationService(
      {
        async findOne({ where }: { where: { id?: string; tenantId?: string } }) {
          if (
            where.id === '01h0000000000000000000401'
            && where.tenantId === '01h0000000000000000000011'
          ) {
            return {
              id: '01h0000000000000000000401',
              tenantId: '01h0000000000000000000011',
              deviceSn: 'SN-2001',
              productKey: 'smart-scale',
              provider: 'aws',
              status: 'active',
              onlineStatus: 'online',
              createdAt: now,
              updatedAt: now,
            };
          }
          return null;
        },
      } as never,
      {} as never,
      {
        async findOne() {
          return storedCredential;
        },
        async save(input: Record<string, unknown>) {
          Object.assign(storedCredential, input);
          return storedCredential;
        },
      } as never,
      {} as never,
      {} as never,
      {
        async findOne() {
          return null;
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        async provisionOnDeviceCreated() {
          return { ok: true };
        },
      } as never,
    );

    const detail = await service.execute<Record<string, unknown>>({
      operation: 'admin.devices.credential.get',
      params: { id: '01h0000000000000000000401' },
      tenantScope: '01h0000000000000000000011',
      requestId: '01h0000000000000000000105',
    });
    assert.equal(detail.certificatePem, certificatePem);
    assert.equal('privateKeyPem' in detail, false);

    const result = await service.execute<Record<string, unknown>>({
      operation: 'admin.devices.credential.download',
      params: { id: '01h0000000000000000000401' },
      tenantScope: '01h0000000000000000000011',
      requestId: '01h0000000000000000000106',
    });

    assert.equal(result.fileName, 'SN-2001-credential-package.tar.gz');
    const archiveBuffer = gunzipSync(Buffer.from(String(result.contentBase64), 'base64'));
    const archiveText = archiveBuffer.toString('utf8');
    assert.equal(archiveText.includes(certificatePem), true);
    assert.equal(archiveText.includes(privateKeyPem), true);
    assert.equal(archiveText.includes('AmazonRootCA1.pem'), true);
    assert.equal(archiveText.includes('-----BEGIN CERTIFICATE-----'), true);

    const claimedDetail = await service.execute<Record<string, unknown>>({
      operation: 'admin.devices.credential.get',
      params: { id: '01h0000000000000000000401' },
      tenantScope: '01h0000000000000000000011',
      requestId: '01h0000000000000000000107',
    });
    assert.equal(claimedDetail.claimAvailable, false);
    assert.equal(typeof claimedDetail.claimedAt, 'string');
    assert.equal(typeof storedCredential.certificatePem, 'string');
    assert.equal(typeof storedCredential.privateKeyPem, 'string');
    assert.equal(decryptDeviceCredentialSecret(String(storedCredential.certificatePem)), certificatePem);
    assert.equal(decryptDeviceCredentialSecret(String(storedCredential.privateKeyPem)), privateKeyPem);

    await assert.rejects(
      () =>
        service.execute({
          operation: 'admin.devices.credential.download',
          params: { id: '01h0000000000000000000401' },
          tenantScope: '01h0000000000000000000011',
          requestId: '01h0000000000000000000108',
        }),
      /device credential secret already claimed/,
    );
  } finally {
    if (previousKey === undefined) {
      delete process.env.AES_KEY;
    } else {
      process.env.AES_KEY = previousKey;
    }
  }
});

test('publishCommandDownlink marks command accepted when bridge queues delivery', async () => {
  const service = createService({
    async findOne() {
      return null;
    },
  });
  const accepted: string[] = [];

  (service as any).iotDownlinkService = {
    async publish() {
      return {
        topic: 'v1/cmd/SN-001/res',
        requestId: 'cmd-001',
        delivery: 'queued',
      };
    },
  };
  (service as any).deviceCommandService = {
    async markCommandAccepted(commandId: string) {
      accepted.push(commandId);
    },
    async markCommandSent() {
      throw new Error('should not mark sent');
    },
    async markCommandFailed() {
      throw new Error('should not mark failed');
    },
  };

  await (service as any).publishCommandDownlink(
    {
      id: 'device-001',
      deviceSn: 'SN-001',
      tenantId: 'tenant-001',
      provider: 'emqx',
    },
    {
      id: 'cmd-001',
      commandType: 'cmd.reboot',
      payloadJson: { force: true },
    },
  );

  assert.deepEqual(accepted, ['cmd-001']);
});

test('publishCommandDownlink marks command sent when device publish succeeds', async () => {
  const service = createService({
    async findOne() {
      return null;
    },
  });
  const sent: string[] = [];

  (service as any).iotDownlinkService = {
    async publish() {
      return {
        topic: 'v1/cmd/SN-001/res',
        requestId: 'cmd-002',
        delivery: 'sent',
      };
    },
  };
  (service as any).deviceCommandService = {
    async markCommandAccepted() {
      throw new Error('should not mark accepted');
    },
    async markCommandSent(commandId: string) {
      sent.push(commandId);
    },
    async markCommandFailed() {
      throw new Error('should not mark failed');
    },
  };

  await (service as any).publishCommandDownlink(
    {
      id: 'device-001',
      deviceSn: 'SN-001',
      tenantId: 'tenant-001',
      provider: 'emqx',
    },
    {
      id: 'cmd-002',
      commandType: 'cmd.reboot',
      payloadJson: { force: true },
    },
  );

  assert.deepEqual(sent, ['cmd-002']);
});

test('admin.devices.credential.download returns emqx credential package with custom root ca', async () => {
  const previousKey = process.env.AES_KEY;
  process.env.AES_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const now = new Date('2026-05-01T10:00:00.000Z');
  const certificatePem = '-----BEGIN CERTIFICATE-----\nemqx-cert\n-----END CERTIFICATE-----';
  const privateKeyPem = '-----BEGIN PRIVATE KEY-----\nemqx-key\n-----END PRIVATE KEY-----';
  const rootCaPem = '-----BEGIN CERTIFICATE-----\nemqx-root\n-----END CERTIFICATE-----';
  try {
    const storedCredential: Record<string, unknown> = {
      tenantId: '01h0000000000000000000011',
      deviceId: '01h0000000000000000000403',
      vendor: 'emqx',
      credentialType: 'certificate',
      credentialId: 'emqx-cert-2003',
      thingName: '01h0000000000000000000403',
      certificateArn: null,
      certificatePem: encryptDeviceCredentialSecret(certificatePem),
      privateKeyPem: encryptDeviceCredentialSecret(privateKeyPem),
      endpoint: 'mqtts://127.0.0.1:8883',
      region: 'self-hosted',
      fingerprint: 'fp-emqx',
      status: 'active',
      issuedAt: now,
      expiresAt: null,
      metadataJson: { productKey: 'pk-emqx-2003', rootCaPem },
      updatedAt: now,
    };
    const service = new DeviceApplicationService(
      {
        async findOne({ where }: { where: { id?: string; tenantId?: string } }) {
          if (
            where.id === '01h0000000000000000000403'
            && where.tenantId === '01h0000000000000000000011'
          ) {
            return {
              id: '01h0000000000000000000403',
              tenantId: '01h0000000000000000000011',
              deviceSn: 'SN-EMQX-2003',
              productKey: 'pk-emqx-2003',
              provider: 'emqx',
              status: 'active',
              onlineStatus: 'online',
              createdAt: now,
              updatedAt: now,
            };
          }
          return null;
        },
      } as never,
      {} as never,
      {
        async findOne() {
          return storedCredential;
        },
        async save(input: Record<string, unknown>) {
          Object.assign(storedCredential, input);
          return storedCredential;
        },
      } as never,
      {} as never,
      {} as never,
      {
        async findOne() {
          return null;
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        async provisionOnDeviceCreated() {
          return { ok: true };
        },
      } as never,
    );

    const result = await service.execute<Record<string, unknown>>({
      operation: 'admin.devices.credential.download',
      params: { id: '01h0000000000000000000403' },
      tenantScope: '01h0000000000000000000011',
      requestId: '01h0000000000000000000302',
    });

    assert.equal(result.fileName, 'SN-EMQX-2003-emqx-credential-package.tar.gz');
    const archiveBuffer = gunzipSync(Buffer.from(String(result.contentBase64), 'base64'));
    const archiveText = archiveBuffer.toString('utf8');
    assert.equal(archiveText.includes(certificatePem), true);
    assert.equal(archiveText.includes(privateKeyPem), true);
    assert.equal(archiveText.includes('SN-EMQX-2003-ca.pem'), true);
    assert.equal(archiveText.includes('emqx-root'), true);
  } finally {
    if (previousKey === undefined) {
      delete process.env.AES_KEY;
    } else {
      process.env.AES_KEY = previousKey;
    }
  }
});
