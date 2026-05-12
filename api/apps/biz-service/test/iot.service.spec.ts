import assert from 'node:assert/strict';
import test from 'node:test';
import { IotService } from '../src/iot/bridge/iot.service';

function createIotService(
  provisionRepo: Record<string, unknown>,
  credentialRepo: Record<string, unknown>,
) {
  return new IotService(
    {
      error() {},
      warn() {},
      debug() {},
    } as never,
    provisionRepo as never,
    credentialRepo as never,
    {} as never,
    {} as never,
  );
}

test('rotateDeviceCertificate reprovisions immediately when local credential is missing', async () => {
  const previousKey = process.env.AES_KEY;
  process.env.AES_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const savedProvisionRecords: Record<string, unknown>[] = [];
  const savedCredentials: Record<string, unknown>[] = [];
  try {
    const provisionRepo = {
      create(input: Record<string, unknown>) {
        return { id: `record-${savedProvisionRecords.length + 1}`, ...input };
      },
      async save(input: Record<string, unknown>) {
        savedProvisionRecords.push(input);
        return input;
      },
    };

    const credentialRepo = {
      async findOne() {
        return null;
      },
      create(input: Record<string, unknown>) {
        return input;
      },
      async save(input: Record<string, unknown>) {
        savedCredentials.push(input);
        return input;
      },
    };

    const service = createIotService(provisionRepo, credentialRepo);

    (service as unknown as { provisionAwsDeviceCertificate: (input: Record<string, unknown>) => Promise<Record<string, unknown>> }).provisionAwsDeviceCertificate =
      async (input) => ({
        accepted: true,
        trigger: input.trigger,
        status: 'active',
        vendor: 'aws',
        credentialId: 'cert-3001',
        certificateArn: 'arn:aws:iot:ap-southeast-1:123:cert/3001',
        certificatePem: '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----',
        privateKey: '-----BEGIN PRIVATE KEY-----\nxyz\n-----END PRIVATE KEY-----',
        thingName: 'device-1',
        endpoint: 'iot.example.com',
        region: 'ap-southeast-1',
        fingerprint: 'fp-3001',
        productKey: input.productKey,
      });

    const result = await service.rotateDeviceCertificate({
      tenantId: 'tenant-1',
      deviceId: 'device-1',
      deviceSn: 'SN-3001',
      productKey: 'smart-scale',
      vendor: 'aws',
      requestId: 'req-3001',
      reason: 'reissue-missing-local-cert',
    });

    assert.equal(result.status, 'active');
    assert.equal(result.mode, 'reissued-on-missing-local-credential');
    assert.equal(savedCredentials.length, 1);
    assert.equal(savedProvisionRecords.length, 2);
    assert.equal(savedProvisionRecords[0].status, 'rotate_requested');
    assert.equal(savedProvisionRecords[1].status, 'active');
    assert.equal(savedCredentials[0].credentialType, 'certificate');
    assert.equal(savedCredentials[0].credentialId, 'cert-3001');
  } finally {
    if (previousKey === undefined) {
      delete process.env.AES_KEY;
    } else {
      process.env.AES_KEY = previousKey;
    }
  }
});

test('rotateDeviceCertificate reissues aws certificate immediately when local credential exists', async () => {
  const previousKey = process.env.AES_KEY;
  process.env.AES_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const savedProvisionRecords: Record<string, unknown>[] = [];
  const savedCredentials: Record<string, unknown>[] = [];
  try {
    const existedCredential: Record<string, unknown> = {
      id: 'cred-aws-1',
      tenantId: 'tenant-1',
      deviceId: 'device-aws-1',
      vendor: 'aws',
      credentialType: 'certificate',
      credentialId: 'cert-old',
      thingName: 'device-aws-1',
      certificateArn: 'arn:aws:iot:ap-southeast-1:123:cert/old',
      certificatePem: 'encrypted-old-cert',
      privateKeyPem: 'encrypted-old-key',
      status: 'active',
      metadataJson: {
        retrieval: {
          claimedAt: '2026-05-02T00:00:00.000Z',
        },
      },
    };
    const service = createIotService(
      {
        create(input: Record<string, unknown>) {
          return { id: `record-${savedProvisionRecords.length + 1}`, ...input };
        },
        async save(input: Record<string, unknown>) {
          savedProvisionRecords.push(input);
          return input;
        },
      } as never,
      {
        async findOne() {
          return existedCredential;
        },
        create(input: Record<string, unknown>) {
          return input;
        },
        async save(input: Record<string, unknown>) {
          savedCredentials.push(input);
          return input;
        },
      } as never,
    );

    (service as unknown as {
      provisionAwsDeviceCertificate: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    }).provisionAwsDeviceCertificate = async (input) => ({
      accepted: true,
      trigger: input.trigger,
      status: 'active',
      vendor: 'aws',
      credentialId: 'cert-new',
      certificateArn: 'arn:aws:iot:ap-southeast-1:123:cert/new',
      certificatePem: '-----BEGIN CERTIFICATE-----\nnew\n-----END CERTIFICATE-----',
      privateKey: '-----BEGIN PRIVATE KEY-----\nnew\n-----END PRIVATE KEY-----',
      thingName: input.deviceId,
      endpoint: 'iot.example.com',
      region: 'ap-southeast-1',
      fingerprint: 'fp-new',
      productKey: input.productKey,
    });

    const result = await service.rotateDeviceCertificate({
      tenantId: 'tenant-1',
      deviceId: 'device-aws-1',
      deviceSn: 'SN-AWS-1',
      productKey: 'smart-scale',
      vendor: 'aws',
      requestId: 'req-aws-1',
      reason: 'rotate',
    });

    assert.equal(result.status, 'active');
    assert.equal(result.mode, 'reissued-certificate');
    assert.equal(savedProvisionRecords.length, 2);
    assert.equal(savedCredentials.length, 2);
    assert.equal(savedCredentials[0].status, 'rotating');
    assert.equal(savedCredentials[1].credentialId, 'cert-new');
    assert.equal(
      (savedCredentials[1].metadataJson as Record<string, unknown> | undefined)?.retrieval,
      undefined,
    );
  } finally {
    if (previousKey === undefined) {
      delete process.env.AES_KEY;
    } else {
      process.env.AES_KEY = previousKey;
    }
  }
});

test('provisionOnDeviceCreated stores aliyun device secret credentials', async () => {
  const previousKey = process.env.AES_KEY;
  const previousVendor = process.env.IOT_VENDOR;
  process.env.AES_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.IOT_VENDOR = 'aliyun';
  const savedProvisionRecords: Record<string, unknown>[] = [];
  const savedCredentials: Record<string, unknown>[] = [];
  try {
    const service = createIotService(
      {
        create(input: Record<string, unknown>) {
          return { id: `record-${savedProvisionRecords.length + 1}`, ...input };
        },
        async save(input: Record<string, unknown>) {
          savedProvisionRecords.push(input);
          return input;
        },
      } as never,
      {
        async findOne() {
          return null;
        },
        create(input: Record<string, unknown>) {
          return input;
        },
        async save(input: Record<string, unknown>) {
          savedCredentials.push(input);
          return input;
        },
      } as never,
    );

    (service as unknown as {
      provisionAliyunDeviceSecret: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    }).provisionAliyunDeviceSecret = async (input) => ({
      accepted: true,
      trigger: input.trigger,
      status: 'active',
      vendor: 'aliyun',
      credentialId: 'iot-id-3002',
      thingName: input.deviceId,
      deviceName: input.deviceId,
      deviceSecret: 'secret-3002',
      endpoint: 'https://iot.cn-shanghai.aliyuncs.com',
      region: 'cn-shanghai',
      productKey: input.productKey,
    });

    const result = await service.provisionOnDeviceCreated({
      tenantId: 'tenant-1',
      deviceId: 'device-aliyun-1',
      deviceSn: 'SN-ALIYUN-1',
      provider: 'aliyun',
      productKey: 'pk-aliyun-1',
      requestId: 'req-aliyun-1',
      trigger: 'admin.devices.create',
    });

    assert.equal(result.status, 'active');
    assert.equal(savedProvisionRecords.length, 1);
    assert.equal(savedCredentials.length, 1);
    assert.equal(savedCredentials[0].vendor, 'aliyun');
    assert.equal(savedCredentials[0].credentialId, 'iot-id-3002');
    assert.equal(savedCredentials[0].thingName, 'device-aliyun-1');
  } finally {
    if (previousKey === undefined) {
      delete process.env.AES_KEY;
    } else {
      process.env.AES_KEY = previousKey;
    }
    if (previousVendor === undefined) {
      delete process.env.IOT_VENDOR;
    } else {
      process.env.IOT_VENDOR = previousVendor;
    }
  }
});

test('rotateDeviceCertificate reissues aliyun device secret for download', async () => {
  const previousKey = process.env.AES_KEY;
  process.env.AES_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const savedProvisionRecords: Record<string, unknown>[] = [];
  const savedCredentials: Record<string, unknown>[] = [];
  try {
    const existedCredential: Record<string, unknown> = {
      id: 'cred-aliyun-1',
      tenantId: 'tenant-1',
      deviceId: 'device-aliyun-2',
      vendor: 'aliyun',
      credentialType: 'certificate',
      credentialId: 'iot-id-old',
      thingName: 'device-aliyun-2',
      privateKeyPem: 'encrypted-old',
      status: 'active',
      metadataJson: {
        retrieval: {
          claimedAt: '2026-05-02T00:00:00.000Z',
        },
      },
    };
    const service = createIotService(
      {
        create(input: Record<string, unknown>) {
          return { id: `record-${savedProvisionRecords.length + 1}`, ...input };
        },
        async save(input: Record<string, unknown>) {
          savedProvisionRecords.push(input);
          return input;
        },
      } as never,
      {
        async findOne() {
          return existedCredential;
        },
        create(input: Record<string, unknown>) {
          return input;
        },
        async save(input: Record<string, unknown>) {
          savedCredentials.push(input);
          return input;
        },
      } as never,
    );

    (service as unknown as {
      reissueAliyunDeviceSecret: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    }).reissueAliyunDeviceSecret = async (input) => ({
      accepted: true,
      trigger: input.trigger,
      status: 'active',
      vendor: 'aliyun',
      credentialId: 'iot-id-new',
      thingName: input.deviceId,
      deviceName: input.deviceId,
      deviceSecret: 'secret-new',
      endpoint: 'https://iot.cn-shanghai.aliyuncs.com',
      region: 'cn-shanghai',
      productKey: input.productKey,
    });

    const result = await service.rotateDeviceCertificate({
      tenantId: 'tenant-1',
      deviceId: 'device-aliyun-2',
      deviceSn: 'SN-ALIYUN-2',
      productKey: 'pk-aliyun-2',
      vendor: 'aliyun',
      requestId: 'req-aliyun-2',
      reason: 'reissue',
    });

    assert.equal(result.status, 'active');
    assert.equal(result.mode, 'reissued-device-secret');
    assert.equal(savedProvisionRecords.length, 2);
    assert.equal(savedCredentials.length, 2);
    assert.equal(savedCredentials[0].status, 'rotating');
    assert.equal(savedCredentials[1].credentialId, 'iot-id-new');
    assert.equal(
      (savedCredentials[1].metadataJson as Record<string, unknown> | undefined)?.retrieval,
      undefined,
    );
  } finally {
    if (previousKey === undefined) {
      delete process.env.AES_KEY;
    } else {
      process.env.AES_KEY = previousKey;
    }
  }
});

test('deleteDeviceIdentity removes cloud identity metadata and local records for aws', async () => {
  const deletedCredentials: Array<Record<string, unknown>> = [];
  const deletedProvisionRecords: Array<Record<string, unknown>> = [];
  const service = createIotService(
    {
      create(input: Record<string, unknown>) {
        return input;
      },
      async save(input: Record<string, unknown>) {
        return input;
      },
      async findOne() {
        return null;
      },
      async delete(input: Record<string, unknown>) {
        deletedProvisionRecords.push(input);
      },
    } as never,
    {
      async findOne() {
        return {
          thingName: 'device-1',
          certificateArn: 'arn:aws:iot:ap-southeast-1:123:cert/3001',
        };
      },
      create(input: Record<string, unknown>) {
        return input;
      },
      async save(input: Record<string, unknown>) {
        return input;
      },
      async delete(input: Record<string, unknown>) {
        deletedCredentials.push(input);
      },
    } as never,
  );

  const steps: string[] = [];
  (service as unknown as { deleteAwsDeviceIdentity: (input: Record<string, unknown>) => Promise<void> }).deleteAwsDeviceIdentity =
    async (input) => {
      steps.push(`${input.thingName}:${input.certificateArn}`);
    };

  const result = await service.deleteDeviceIdentity({
    tenantId: 'tenant-1',
    deviceId: 'device-1',
    vendor: 'aws',
    requestId: 'req-delete-1',
  });

  assert.equal(result.cloudDeleted, true);
  assert.equal(steps.length, 1);
  assert.equal(deletedCredentials.length, 1);
  assert.equal(deletedProvisionRecords.length, 1);
});

test('deleteDeviceIdentity removes cloud identity metadata and local records for aliyun', async () => {
  const deletedCredentials: Array<Record<string, unknown>> = [];
  const deletedProvisionRecords: Array<Record<string, unknown>> = [];
  const service = createIotService(
    {
      create(input: Record<string, unknown>) {
        return input;
      },
      async save(input: Record<string, unknown>) {
        return input;
      },
      async findOne() {
        return null;
      },
      async delete(input: Record<string, unknown>) {
        deletedProvisionRecords.push(input);
      },
    } as never,
    {
      async findOne() {
        return {
          thingName: 'aliyun-device-1',
          credentialId: 'iot-id-1',
        };
      },
      create(input: Record<string, unknown>) {
        return input;
      },
      async save(input: Record<string, unknown>) {
        return input;
      },
      async delete(input: Record<string, unknown>) {
        deletedCredentials.push(input);
      },
    } as never,
  );

  const steps: string[] = [];
  (service as unknown as { deleteAliyunDeviceIdentity: (input: Record<string, unknown>) => Promise<void> }).deleteAliyunDeviceIdentity =
    async (input) => {
      steps.push(`${input.productKey}:${input.deviceName}:${input.credentialId}`);
    };

  const result = await service.deleteDeviceIdentity({
    tenantId: 'tenant-1',
    deviceId: 'device-1',
    deviceSn: 'aliyun-device-1',
    productKey: 'pk-1',
    vendor: 'aliyun',
    requestId: 'req-delete-2',
  });

  assert.equal(result.cloudDeleted, true);
  assert.equal(steps.length, 1);
  assert.equal(deletedCredentials.length, 1);
  assert.equal(deletedProvisionRecords.length, 1);
});

test('deleteDeviceIdentity falls back to deviceId for aliyun deviceName when no local credential exists', async () => {
  const service = createIotService(
    {
      create(input: Record<string, unknown>) {
        return input;
      },
      async save(input: Record<string, unknown>) {
        return input;
      },
      async findOne() {
        return null;
      },
      async delete() {},
    } as never,
    {
      async findOne() {
        return null;
      },
      create(input: Record<string, unknown>) {
        return input;
      },
      async save(input: Record<string, unknown>) {
        return input;
      },
      async delete() {},
    } as never,
  );

  const steps: string[] = [];
  (service as unknown as { deleteAliyunDeviceIdentity: (input: Record<string, unknown>) => Promise<void> }).deleteAliyunDeviceIdentity =
    async (input) => {
      steps.push(`${input.productKey}:${input.deviceName}:${input.credentialId}`);
    };

  await service.deleteDeviceIdentity({
    tenantId: 'tenant-1',
    deviceId: 'device-id-1',
    deviceSn: 'legacy-sn-1',
    productKey: 'pk-1',
    vendor: 'aliyun',
    requestId: 'req-delete-3',
  });

  assert.equal(steps.length, 1);
  assert.equal(steps[0], 'pk-1:device-id-1:null');
});

test('provisionOnDeviceCreated stores emqx certificate credentials', async () => {
  const previousKey = process.env.AES_KEY;
  const previousVendor = process.env.IOT_VENDOR;
  process.env.AES_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.IOT_VENDOR = 'emqx';
  const savedProvisionRecords: Record<string, unknown>[] = [];
  const savedCredentials: Record<string, unknown>[] = [];
  try {
    const service = createIotService(
      {
        create(input: Record<string, unknown>) {
          return { id: `record-${savedProvisionRecords.length + 1}`, ...input };
        },
        async save(input: Record<string, unknown>) {
          savedProvisionRecords.push(input);
          return input;
        },
      } as never,
      {
        async findOne() {
          return null;
        },
        create(input: Record<string, unknown>) {
          return input;
        },
        async save(input: Record<string, unknown>) {
          savedCredentials.push(input);
          return input;
        },
      } as never,
    );

    (service as unknown as {
      provisionEmqxDeviceCertificate: (input: Record<string, unknown>) => Record<string, unknown>;
    }).provisionEmqxDeviceCertificate = (input) => ({
      accepted: true,
      trigger: input.trigger,
      status: 'active',
      vendor: 'emqx',
      credentialId: 'emqx-cert-1',
      certificatePem: '-----BEGIN CERTIFICATE-----\nemqx\n-----END CERTIFICATE-----',
      privateKey: '-----BEGIN PRIVATE KEY-----\nemqx\n-----END PRIVATE KEY-----',
      thingName: input.deviceId,
      endpoint: 'mqtts://127.0.0.1:8883',
      region: 'self-hosted',
      fingerprint: 'fp-emqx-1',
      productKey: input.productKey,
      authMode: 'mtls-ca-signed',
      rootCaPem: '-----BEGIN CERTIFICATE-----\nroot\n-----END CERTIFICATE-----',
    });

    const result = await service.provisionOnDeviceCreated({
      tenantId: 'tenant-1',
      deviceId: 'device-emqx-1',
      deviceSn: 'SN-EMQX-1',
      provider: 'emqx',
      productKey: 'pk-emqx-1',
      requestId: 'req-emqx-1',
      trigger: 'admin.devices.create',
    });

    assert.equal(result.status, 'active');
    assert.equal(savedProvisionRecords.length, 1);
    assert.equal(savedCredentials.length, 1);
    assert.equal(savedCredentials[0].vendor, 'emqx');
    assert.equal(savedCredentials[0].credentialId, 'emqx-cert-1');
    assert.equal(savedCredentials[0].thingName, 'device-emqx-1');
    assert.equal(
      (savedCredentials[0].metadataJson as Record<string, unknown> | undefined)?.authMode,
      'mtls-ca-signed',
    );
  } finally {
    if (previousKey === undefined) {
      delete process.env.AES_KEY;
    } else {
      process.env.AES_KEY = previousKey;
    }
    if (previousVendor === undefined) {
      delete process.env.IOT_VENDOR;
    } else {
      process.env.IOT_VENDOR = previousVendor;
    }
  }
});

test('deleteDeviceIdentity removes local records for emqx without cloud teardown', async () => {
  const deletedCredentials: Array<Record<string, unknown>> = [];
  const deletedProvisionRecords: Array<Record<string, unknown>> = [];
  const service = createIotService(
    {
      create(input: Record<string, unknown>) {
        return input;
      },
      async save(input: Record<string, unknown>) {
        return input;
      },
      async findOne() {
        return null;
      },
      async delete(input: Record<string, unknown>) {
        deletedProvisionRecords.push(input);
      },
    } as never,
    {
      async findOne() {
        return {
          thingName: 'device-emqx-1',
          credentialId: 'emqx-cert-1',
        };
      },
      create(input: Record<string, unknown>) {
        return input;
      },
      async save(input: Record<string, unknown>) {
        return input;
      },
      async delete(input: Record<string, unknown>) {
        deletedCredentials.push(input);
      },
    } as never,
  );

  const result = await service.deleteDeviceIdentity({
    tenantId: 'tenant-1',
    deviceId: 'device-emqx-1',
    vendor: 'emqx',
    requestId: 'req-delete-emqx-1',
  });

  assert.equal(result.cloudDeleted, false);
  assert.equal(deletedCredentials.length, 1);
  assert.equal(deletedProvisionRecords.length, 1);
});

test('provisionOnDeviceCreated keeps tenantId and deviceSn in aws request payload', async () => {
  const previousKey = process.env.AES_KEY;
  const previousVendor = process.env.IOT_VENDOR;
  process.env.AES_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.IOT_VENDOR = 'aws';
  const savedProvisionRecords: Record<string, unknown>[] = [];
  try {
    const service = createIotService(
      {
        create(input: Record<string, unknown>) {
          return { id: `record-${savedProvisionRecords.length + 1}`, ...input };
        },
        async save(input: Record<string, unknown>) {
          savedProvisionRecords.push(input);
          return input;
        },
      } as never,
      {
        async findOne() {
          return null;
        },
        create(input: Record<string, unknown>) {
          return input;
        },
        async save(input: Record<string, unknown>) {
          return input;
        },
      } as never,
    );

    (service as unknown as {
      provisionAwsDeviceCertificate: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    }).provisionAwsDeviceCertificate = async (input) => {
      assert.equal(input.deviceId, 'device-aws-tenant-1');
      assert.equal(input.deviceSn, 'SN-AWS-TENANT-1');
      assert.equal(input.tenantId, 'tenant-aws-1');
      return {
        accepted: true,
        trigger: input.trigger,
        status: 'active',
        vendor: 'aws',
        credentialId: 'cert-tenant-1',
        certificateArn: 'arn:aws:iot:ap-southeast-1:123:cert/tenant-1',
        certificatePem: '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----',
        privateKey: '-----BEGIN PRIVATE KEY-----\nxyz\n-----END PRIVATE KEY-----',
        thingName: input.deviceId,
        endpoint: 'iot.example.com',
        region: 'ap-southeast-1',
        fingerprint: 'fp-tenant-1',
        productKey: input.productKey,
      };
    };

    await service.provisionOnDeviceCreated({
      tenantId: 'tenant-aws-1',
      deviceId: 'device-aws-tenant-1',
      deviceSn: 'SN-AWS-TENANT-1',
      provider: 'aws',
      productKey: 'pk-aws-tenant-1',
      requestId: 'req-aws-tenant-1',
      trigger: 'admin.devices.create',
    });

    assert.equal(savedProvisionRecords.length, 1);
    assert.equal(
      (savedProvisionRecords[0].requestPayloadJson as Record<string, unknown>).tenantId,
      'tenant-aws-1',
    );
    assert.equal(
      (savedProvisionRecords[0].requestPayloadJson as Record<string, unknown>).deviceSn,
      'SN-AWS-TENANT-1',
    );
  } finally {
    if (previousKey === undefined) {
      delete process.env.AES_KEY;
    } else {
      process.env.AES_KEY = previousKey;
    }
    if (previousVendor === undefined) {
      delete process.env.IOT_VENDOR;
    } else {
      process.env.IOT_VENDOR = previousVendor;
    }
  }
});
