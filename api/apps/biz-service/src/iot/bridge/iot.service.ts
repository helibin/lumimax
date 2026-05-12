import crypto from 'node:crypto';
import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  generateId,
} from '@lumimax/runtime';
import { AppLogger } from '@lumimax/logger';
import {
  encryptDeviceCredentialSecret,
  protectDeviceCredentialPayload,
} from '@lumimax/security';
import {
  getEnvString,
  resolveAliyunCredentials,
  resolveAliyunRegion,
  resolveCloudCredentials,
  resolveCloudRegion,
  resolveConfiguredIotVendor,
  type CloudIotVendorName,
} from '@lumimax/config';
import type { Repository } from 'typeorm';
import {
  DeviceCredentialEntity,
  IotProvisionRecordEntity,
} from '../../common/entities/biz.entities';
import { IotIngestService } from '../events/iot-ingest.service';
import { IotMessageRegistryService } from '../events/iot-message-registry.service';
import { issueEmqxDeviceCertificate } from '../providers/emqx/emqx-device-credential.util';

const { IoTClient, CreateThingCommand, CreateKeysAndCertificateCommand, AttachPolicyCommand, AttachThingPrincipalCommand, DescribeEndpointCommand, DetachThingPrincipalCommand, DetachPolicyCommand, UpdateCertificateCommand, DeleteCertificateCommand, DeleteThingCommand } =
  require('@aws-sdk/client-iot') as {
    IoTClient: new (input: Record<string, unknown>) => {
      send(command: unknown): Promise<unknown>;
    };
    CreateThingCommand: new (input: Record<string, unknown>) => unknown;
    CreateKeysAndCertificateCommand: new (input: Record<string, unknown>) => unknown;
    AttachPolicyCommand: new (input: Record<string, unknown>) => unknown;
    AttachThingPrincipalCommand: new (input: Record<string, unknown>) => unknown;
    DescribeEndpointCommand: new (input: Record<string, unknown>) => unknown;
    DetachThingPrincipalCommand: new (input: Record<string, unknown>) => unknown;
    DetachPolicyCommand: new (input: Record<string, unknown>) => unknown;
    UpdateCertificateCommand: new (input: Record<string, unknown>) => unknown;
    DeleteCertificateCommand: new (input: Record<string, unknown>) => unknown;
    DeleteThingCommand: new (input: Record<string, unknown>) => unknown;
  };

@Injectable()
export class IotService {
  constructor(
    @Inject(AppLogger) private readonly logger: AppLogger,
    @InjectRepository(IotProvisionRecordEntity)
    private readonly iotProvisionRecordRepository: Repository<IotProvisionRecordEntity>,
    @InjectRepository(DeviceCredentialEntity)
    private readonly deviceCredentialRepository: Repository<DeviceCredentialEntity>,
    @Inject(forwardRef(() => IotIngestService))
    private readonly iotIngestService: IotIngestService,
    @Inject(IotMessageRegistryService)
    private readonly iotMessageRegistryService: IotMessageRegistryService,
  ) {}

  getStatus(): string {
    return 'biz-iot-ready';
  }

  ingestCloudMessage(input: {
    vendor: CloudIotVendorName;
    topic: string;
    payload: Record<string, unknown>;
    receivedAt?: number;
    requestId?: string;
  }) {
    return this.iotIngestService.ingestCloudMessage(input);
  }

  listMessages(input: {
    tenantId: string;
    page?: number;
    pageSize?: number;
    keyword?: string;
  }) {
    return this.iotMessageRegistryService.list(input);
  }

  getMessage(tenantId: string, id: string) {
    return this.iotMessageRegistryService.get(tenantId, id);
  }

  async provisionOnDeviceCreated(input: {
    deviceId: string;
    deviceSn: string;
    provider: string;
    productKey: string;
    tenantId: string;
    requestId: string;
    trigger: 'admin.devices.create' | 'devices.create' | 'admin.devices.provision';
  }): Promise<Record<string, unknown>> {
    const vendor = resolveConfiguredIotVendor();
    const requestPayload = {
      trigger: input.trigger,
      deviceId: input.deviceId,
      deviceSn: input.deviceSn,
      tenantId: input.tenantId,
      productKey: input.productKey,
      vendor,
    };

    try {
      let responsePayload: Record<string, unknown>;
      switch (vendor) {
        case 'aws':
          responsePayload = await this.provisionAwsDeviceCertificate(input);
          break;
        case 'aliyun':
          responsePayload = await this.provisionAliyunDeviceSecret(input);
          break;
        case 'emqx':
          responsePayload = this.provisionEmqxDeviceCertificate(input);
          break;
      }

      const record = await this.createProvisionRecord({
        tenantId: input.tenantId,
        deviceId: input.deviceId,
        vendor,
        status: pickString(responsePayload.status) ?? (vendor === 'aws' ? 'active' : 'queued'),
        requestPayload,
        responsePayload,
        requestId: input.requestId,
      });

      await this.upsertDeviceCredential({
        deviceId: input.deviceId,
        requestId: input.requestId,
        responsePayload,
        tenantId: input.tenantId,
        vendor,
      });

      return {
        ok: true,
        vendor,
        status: record.status,
        recordId: record.id,
        requestId: input.requestId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `设备物联网凭证下发失败 vendor=${vendor} deviceId=${input.deviceId} requestId=${input.requestId}: ${message}`,
      );
      await this.createProvisionRecord({
        tenantId: input.tenantId,
        deviceId: input.deviceId,
        vendor,
        status: 'failed',
        requestPayload,
        responsePayload: {
          accepted: false,
          status: 'failed',
          vendor,
        },
        requestId: input.requestId,
        errorJson: {
          message,
        },
      });
      throw error;
    }
  }

  async rotateDeviceCertificate(input: {
    tenantId: string;
    deviceId: string;
    deviceSn: string;
    productKey?: string;
    vendor?: CloudIotVendorName;
    requestId: string;
    reason?: string;
  }): Promise<Record<string, unknown>> {
    const vendor = input.vendor ?? resolveConfiguredIotVendor();
    const requestedAt = new Date();
    const requestPayload = filterEmptyRecord({
      trigger: 'admin.devices.certificate.rotate',
      reason: pickString(input.reason),
      deviceId: input.deviceId,
      deviceSn: input.deviceSn,
      vendor,
      requestedAt: requestedAt.toISOString(),
    }) ?? {};
    const responsePayload = {
      accepted: true,
      mode: 'delegated-to-iot-module',
      status: 'rotate_requested',
      queuedAt: requestedAt.toISOString(),
    };
    const persistedResponsePayload = protectDeviceCredentialPayload(responsePayload) ?? responsePayload;

    const record = await this.iotProvisionRecordRepository.save(
      this.iotProvisionRecordRepository.create({
        tenantId: input.tenantId,
        deviceId: input.deviceId,
        vendor,
        status: 'rotate_requested',
        requestPayloadJson: requestPayload,
        responsePayloadJson: persistedResponsePayload,
      }),
    );

    const existed = await this.deviceCredentialRepository.findOne({
      where: { tenantId: input.tenantId, deviceId: input.deviceId, credentialType: 'certificate' },
      order: { createdAt: 'DESC' },
    });

    if (existed) {
      await this.markCredentialRotating(existed, requestedAt, input.requestId, input.reason);
    }

    if (vendor === 'aws') {

      const reprovisionResponse = await this.provisionAwsDeviceCertificate({
        deviceId: input.deviceId,
        deviceSn: input.deviceSn,
        productKey: input.productKey ?? '',
        requestId: input.requestId,
        trigger: 'admin.devices.certificate.rotate',
      });

      const reprovisionRecord = await this.createProvisionRecord({
        tenantId: input.tenantId,
        deviceId: input.deviceId,
        vendor,
        status: pickString(reprovisionResponse.status) ?? 'active',
        requestPayload,
        responsePayload: reprovisionResponse,
        requestId: input.requestId,
      });

      await this.upsertDeviceCredential({
        deviceId: input.deviceId,
        requestId: input.requestId,
        responsePayload: reprovisionResponse,
        tenantId: input.tenantId,
        vendor,
      });

      return {
        ok: true,
        tenantId: input.tenantId,
        deviceId: input.deviceId,
        deviceSn: input.deviceSn,
        vendor,
        status: reprovisionRecord.status,
        recordId: reprovisionRecord.id,
        requestId: input.requestId,
        mode: existed ? 'reissued-certificate' : 'reissued-on-missing-local-credential',
      };
    }

    if (vendor === 'aliyun') {
      const reprovisionResponse = await this.reissueAliyunDeviceSecret({
        deviceId: input.deviceId,
        deviceSn: input.deviceSn,
        productKey: input.productKey ?? '',
        credentialId: existed?.credentialId ?? null,
        requestId: input.requestId,
        trigger: 'admin.devices.certificate.rotate',
      });

      const reprovisionRecord = await this.createProvisionRecord({
        tenantId: input.tenantId,
        deviceId: input.deviceId,
        vendor,
        status: pickString(reprovisionResponse.status) ?? 'active',
        requestPayload,
        responsePayload: reprovisionResponse,
        requestId: input.requestId,
      });

      await this.upsertDeviceCredential({
        deviceId: input.deviceId,
        requestId: input.requestId,
        responsePayload: reprovisionResponse,
        tenantId: input.tenantId,
        vendor,
      });

      return {
        ok: true,
        tenantId: input.tenantId,
        deviceId: input.deviceId,
        deviceSn: input.deviceSn,
        vendor,
        status: reprovisionRecord.status,
        recordId: reprovisionRecord.id,
        requestId: input.requestId,
        mode: existed ? 'reissued-device-secret' : 'reissued-on-missing-local-credential',
      };
    }

    if (vendor === 'emqx') {
      const reprovisionResponse = this.provisionEmqxDeviceCertificate({
        deviceId: input.deviceId,
        deviceSn: input.deviceSn,
        productKey: input.productKey ?? '',
        requestId: input.requestId,
        trigger: 'admin.devices.certificate.rotate',
      });

      const reprovisionRecord = await this.createProvisionRecord({
        tenantId: input.tenantId,
        deviceId: input.deviceId,
        vendor,
        status: pickString(reprovisionResponse.status) ?? 'active',
        requestPayload,
        responsePayload: reprovisionResponse,
        requestId: input.requestId,
      });

      await this.upsertDeviceCredential({
        deviceId: input.deviceId,
        requestId: input.requestId,
        responsePayload: reprovisionResponse,
        tenantId: input.tenantId,
        vendor,
      });

      return {
        ok: true,
        tenantId: input.tenantId,
        deviceId: input.deviceId,
        deviceSn: input.deviceSn,
        vendor,
        status: reprovisionRecord.status,
        recordId: reprovisionRecord.id,
        requestId: input.requestId,
        mode: existed ? 'reissued-certificate' : 'reissued-on-missing-local-credential',
      };
    }

    return {
      ok: true,
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      deviceSn: input.deviceSn,
      vendor,
      status: 'rotate_requested',
      recordId: record.id,
      requestId: input.requestId,
    };
  }

  async deleteDeviceIdentity(input: {
    tenantId: string;
    deviceId: string;
    deviceSn?: string;
    productKey?: string;
    vendor?: CloudIotVendorName;
    requestId: string;
  }): Promise<Record<string, unknown>> {
    const vendor = input.vendor ?? resolveConfiguredIotVendor();
    const credential = await this.deviceCredentialRepository.findOne({
      where: { tenantId: input.tenantId, deviceId: input.deviceId, credentialType: 'certificate' },
      order: { createdAt: 'DESC' },
    });

    if (vendor === 'aws') {
      await this.deleteAwsDeviceIdentity({
        thingName: credential?.thingName ?? this.buildAwsThingName(input.deviceId),
        certificateArn: credential?.certificateArn ?? null,
        requestId: input.requestId,
      });
    } else if (vendor === 'aliyun') {
      await this.deleteAliyunDeviceIdentity({
        productKey: input.productKey ?? null,
        deviceName: credential?.thingName ?? input.deviceId ?? null,
        credentialId: credential?.credentialId ?? null,
        requestId: input.requestId,
      });
    }

    await this.deviceCredentialRepository.delete({
      tenantId: input.tenantId,
      deviceId: input.deviceId,
    });
    await this.iotProvisionRecordRepository.delete({
      tenantId: input.tenantId,
      deviceId: input.deviceId,
    });

    return {
      ok: true,
      vendor,
      deviceId: input.deviceId,
      cloudDeleted: vendor === 'aws' || vendor === 'aliyun',
      localCredentialDeleted: true,
      localProvisionDeleted: true,
      requestId: input.requestId,
    };
  }

  private async upsertDeviceCredential(input: {
    deviceId: string;
    requestId: string;
    responsePayload: Record<string, unknown>;
    tenantId: string;
    vendor: CloudIotVendorName;
  }): Promise<void> {
    const payload = input.responsePayload;
    const certificatePem = pickString(payload.certificatePem);
    const privateKeyPem =
      pickString(payload.privateKey)
      ?? pickString(payload.privateKeyPem)
      ?? pickString(payload.deviceSecret);
    const certificateArn = pickString(payload.certificateArn);
    const credentialId = pickString(payload.credentialId) ?? certificateArn;
    const thingName = pickString(payload.thingName) ?? pickString(payload.deviceName);
    const rootCaPem = pickString(payload.rootCaPem);
    const authMode = pickString(payload.authMode);

    if (!certificatePem && !privateKeyPem && !certificateArn && !thingName) {
      return;
    }

    const existed = await this.deviceCredentialRepository.findOne({
      where: {
        tenantId: input.tenantId,
        deviceId: input.deviceId,
        credentialType: 'certificate',
      },
      order: { createdAt: 'DESC' },
    });
    const isRotation = pickString(payload.trigger) === 'admin.devices.certificate.rotate';
    const nextId = isRotation ? generateId() : existed?.id ?? generateId();
    const nextMetadata = filterEmptyRecord({
      source: 'iot.provision',
      trigger: pickString(payload.trigger),
      productKey: pickString(payload.productKey),
      rootCaPem,
      authMode,
      ...(isRotation
        ? {
          rotation: filterEmptyRecord({
            rotatedFromCredentialId: existed?.credentialId ?? null,
            rotatedFromFingerprint: existed?.fingerprint ?? null,
            rotatedAt: new Date().toISOString(),
            requestId: input.requestId,
          }),
        }
        : {}),
    });

    await this.deviceCredentialRepository.save(
      this.deviceCredentialRepository.create({
        id: nextId,
        tenantId: input.tenantId,
        deviceId: input.deviceId,
        vendor: input.vendor,
        credentialType: 'certificate',
        credentialId: credentialId ?? existed?.credentialId ?? null,
        thingName: thingName ?? existed?.thingName ?? null,
        certificateArn: certificateArn ?? existed?.certificateArn ?? null,
        certificatePem:
          certificatePem !== undefined
            ? encryptDeviceCredentialSecret(certificatePem) ?? null
            : existed?.certificatePem ?? null,
        privateKeyPem:
          privateKeyPem !== undefined
            ? encryptDeviceCredentialSecret(privateKeyPem) ?? null
            : existed?.privateKeyPem ?? null,
        endpoint: pickString(payload.endpoint) ?? existed?.endpoint ?? null,
        region: pickString(payload.region) ?? existed?.region ?? null,
        fingerprint: pickString(payload.fingerprint) ?? existed?.fingerprint ?? null,
        status: pickString(payload.status) ?? existed?.status ?? 'active',
        issuedAt: new Date(),
        expiresAt: existed?.expiresAt ?? null,
        metadataJson: nextMetadata,
      }),
    );
  }

  private provisionEmqxDeviceCertificate(input: {
    deviceId: string;
    deviceSn: string;
    productKey: string;
    requestId: string;
    trigger: 'admin.devices.create' | 'devices.create' | 'admin.devices.provision' | 'admin.devices.certificate.rotate';
  }): Record<string, unknown> {
    return issueEmqxDeviceCertificate(input);
  }

  private async provisionAliyunDeviceSecret(input: {
    deviceId: string;
    deviceSn: string;
    productKey: string;
    requestId: string;
    trigger: 'admin.devices.create' | 'devices.create' | 'admin.devices.provision' | 'admin.devices.certificate.rotate';
  }): Promise<Record<string, unknown>> {
    const productKey = pickString(input.productKey);
    if (!productKey) {
      throw new Error('productKey is required for Aliyun IoT provisioning');
    }
    const response = await this.callAliyunRpc(
      {
        Action: 'RegisterDevice',
        ProductKey: productKey,
        DeviceName: input.deviceId,
      },
      input.requestId,
      'device register',
    );
    return this.normalizeAliyunDeviceCredentialResponse(response, {
      trigger: input.trigger,
      deviceName: input.deviceId,
      productKey,
    });
  }

  private async reissueAliyunDeviceSecret(input: {
    deviceId: string;
    deviceSn: string;
    productKey: string;
    credentialId: null | string;
    requestId: string;
    trigger: 'admin.devices.certificate.rotate';
  }): Promise<Record<string, unknown>> {
    const productKey = pickString(input.productKey);
    if (!productKey) {
      throw new Error('productKey is required for Aliyun IoT device secret retrieval');
    }
    const response = await this.callAliyunRpc(
      filterEmptyRecord({
        Action: 'QueryDeviceInfo',
        IotId: pickString(input.credentialId),
        ProductKey: productKey,
        DeviceName: input.deviceId,
      }) as Record<string, string>,
      input.requestId,
      'device query',
    );
    return this.normalizeAliyunDeviceCredentialResponse(response, {
      trigger: input.trigger,
      deviceName: input.deviceId,
      productKey,
    });
  }

  private async provisionAwsDeviceCertificate(input: {
    deviceId: string;
    deviceSn: string;
    productKey: string;
    tenantId?: string;
    requestId: string;
    trigger: 'admin.devices.create' | 'devices.create' | 'admin.devices.provision' | 'admin.devices.certificate.rotate';
  }): Promise<Record<string, unknown>> {
    const region = resolveCloudRegion();
    const policyName = pickString(getEnvString('IOT_POLICY_NAME'));
    if (!region) {
      throw new Error('CLOUD_REGION is required for AWS IoT provisioning');
    }
    if (!policyName) {
      throw new Error('IOT_POLICY_NAME is required for AWS IoT provisioning');
    }

    const client = this.createAwsIotClient(region);
    const thingName = this.buildAwsThingName(input.deviceId);

    await this.ensureAwsThing(
      client,
      thingName,
      this.buildAwsThingAttributes({
        deviceId: input.deviceId,
        deviceSn: input.deviceSn,
        tenantId: input.tenantId,
      }),
      input.requestId,
    );

    const certificate = (await client.send(
      new CreateKeysAndCertificateCommand({
        setAsActive: true,
      }),
    )) as {
      certificateArn?: string;
      certificateId?: string;
      certificatePem?: string;
      keyPair?: {
        PrivateKey?: string;
      };
    };

    const certificateArn = pickString(certificate.certificateArn);
    const certificateId = pickString(certificate.certificateId);
    const certificatePem = pickString(certificate.certificatePem);
    const privateKeyPem = pickString(certificate.keyPair?.PrivateKey);

    if (!certificateArn || !certificatePem || !privateKeyPem) {
      throw new Error('AWS IoT provisioning returned incomplete certificate payload');
    }

    await client.send(
      new AttachPolicyCommand({
        policyName,
        target: certificateArn,
      }),
    );
    await client.send(
      new AttachThingPrincipalCommand({
        thingName,
        principal: certificateArn,
      }),
    );

    const endpoint = await this.resolveAwsIotEndpoint(client, input.requestId);

    return filterEmptyRecord({
      accepted: true,
      trigger: input.trigger,
      status: 'active',
      vendor: 'aws',
      mode: 'sync-created',
      requestedAt: new Date().toISOString(),
      credentialId: certificateId,
      certificateArn,
      certificatePem,
      privateKey: privateKeyPem,
      thingName,
      endpoint,
      region,
      fingerprint: buildFingerprint(certificatePem),
      productKey: input.productKey,
    })!;
  }

  private createAwsIotClient(region: string) {
    return new IoTClient({
      region,
      credentials: resolveCloudCredentials(),
    });
  }

  private async ensureAwsThing(
    client: { send(command: unknown): Promise<unknown> },
    thingName: string,
    attributes: Record<string, string> | undefined,
    requestId: string,
  ): Promise<void> {
    try {
      await client.send(
        new CreateThingCommand({
          attributePayload: attributes ? { attributes } : undefined,
          thingName,
        }),
      );
    } catch (error) {
      if (isAwsResourceAlreadyExistsError(error)) {
        this.logger.warn(`AWS IoT thing 已存在 thingName=${thingName} requestId=${requestId}`);
        return;
      }
      throw error;
    }
  }

  private async resolveAwsIotEndpoint(
    client: { send(command: unknown): Promise<unknown> },
    requestId: string,
  ): Promise<string | undefined> {
    const configuredEndpoint = pickString(getEnvString('IOT_ENDPOINT'));
    if (configuredEndpoint) {
      return configuredEndpoint;
    }

    try {
      const response = (await client.send(
        new DescribeEndpointCommand({
          endpointType: 'iot:Data-ATS',
        }),
      )) as { endpointAddress?: string };
      return pickString(response.endpointAddress);
    } catch (error) {
      this.logger.warn(
        `AWS IoT endpoint 查询失败 requestId=${requestId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }

  private buildAwsThingName(deviceId: string): string {
    return deviceId.trim();
  }

  private buildAwsThingAttributes(input: {
    deviceId: string;
    deviceSn: string;
    tenantId?: string;
  }): Record<string, string> | undefined {
    const attributes = filterEmptyRecord({
      deviceId: pickString(input.deviceId),
      deviceSn: pickString(input.deviceSn),
      tenantId: pickString(input.tenantId),
    });
    if (!attributes) {
      return undefined;
    }
    return Object.fromEntries(
      Object.entries(attributes).map(([key, value]) => [key, String(value)]),
    );
  }

  private async deleteAwsDeviceIdentity(input: {
    thingName: null | string;
    certificateArn: null | string;
    requestId: string;
  }): Promise<void> {
    const region = resolveCloudRegion();
    if (!region) {
      throw new Error('CLOUD_REGION is required for AWS IoT deletion');
    }
    const client = this.createAwsIotClient(region);
    const policyName = pickString(getEnvString('IOT_POLICY_NAME'));
    const thingName = pickString(input.thingName);
    const certificateArn = pickString(input.certificateArn);

    if (thingName && certificateArn) {
      await this.tryAwsDeleteStep(
        () =>
          client.send(
            new DetachThingPrincipalCommand({
              thingName,
              principal: certificateArn,
            }),
          ),
        input.requestId,
        `detach thing principal thingName=${thingName}`,
      );
    }
    if (policyName && certificateArn) {
      await this.tryAwsDeleteStep(
        () =>
          client.send(
            new DetachPolicyCommand({
              policyName,
              target: certificateArn,
            }),
          ),
        input.requestId,
        `detach policy certificateArn=${certificateArn}`,
      );
    }
    if (certificateArn) {
      await this.tryAwsDeleteStep(
        () =>
          client.send(
            new UpdateCertificateCommand({
              certificateId: certificateArn.split('/').pop(),
              newStatus: 'INACTIVE',
            }),
          ),
        input.requestId,
        `deactivate certificate certificateArn=${certificateArn}`,
      );
      await this.tryAwsDeleteStep(
        () =>
          client.send(
            new DeleteCertificateCommand({
              certificateId: certificateArn.split('/').pop(),
              forceDelete: true,
            }),
          ),
        input.requestId,
        `delete certificate certificateArn=${certificateArn}`,
      );
    }
    if (thingName) {
      await this.tryAwsDeleteStep(
        () =>
          client.send(
            new DeleteThingCommand({
              thingName,
            }),
          ),
        input.requestId,
        `delete thing thingName=${thingName}`,
      );
    }
  }

  private async deleteAliyunDeviceIdentity(input: {
    productKey: null | string;
    deviceName: null | string;
    credentialId: null | string;
    requestId: string;
  }): Promise<void> {
    const regionId = resolveAliyunRegion() ?? '';
    const credentials = resolveAliyunCredentials();
    const accessKeyId = credentials?.accessKeyId ?? '';
    const accessKeySecret = credentials?.secretAccessKey ?? '';
    const endpoint = normalizeAliyunEndpoint(
      getEnvString('IOT_ENDPOINT', '') || `iot.${regionId}.aliyuncs.com`,
    );
    const instanceId = getEnvString('IOT_INSTANCE_ID', '') || undefined;
    const productKey = pickString(input.productKey);
    const deviceName = pickString(input.deviceName);
    const iotId = pickString(input.credentialId);

    if (!regionId || !accessKeyId || !accessKeySecret || !endpoint) {
      throw new Error('Aliyun IoT credentials incomplete for device deletion');
    }
    if (!iotId && !(productKey && deviceName)) {
      throw new Error('Aliyun IoT deletion requires IotId or ProductKey + DeviceName');
    }

    const params: Record<string, string> = {
      AccessKeyId: accessKeyId,
      Action: 'DeleteDevice',
      Format: 'JSON',
      RegionId: regionId,
      SignatureMethod: 'HMAC-SHA1',
      SignatureNonce: crypto.randomUUID(),
      SignatureVersion: '1.0',
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      Version: '2018-01-20',
    };
    if (instanceId) {
      params.IotInstanceId = instanceId;
    }
    if (iotId) {
      params.IotId = iotId;
    } else {
      params.ProductKey = productKey!;
      params.DeviceName = deviceName!;
    }
    params.Signature = signAliyunRpcParams(params, accessKeySecret);

    const response = await fetch(`${endpoint}/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
    });
    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`Aliyun IoT delete failed: ${response.status} ${rawText}`);
    }
    const payload = safeParseJson(rawText);
    if (payload && payload.Success === false) {
      const code = pickString(payload.Code) ?? 'unknown';
      if (code.includes('DeviceNotFound') || code.includes('IotId.NotFound')) {
        this.logger.warn(
          `阿里云 IoT 删除已跳过 requestId=${input.requestId} code=${code}`,
        );
        return;
      }
      throw new Error(
        `Aliyun IoT delete failed: ${code} ${pickString(payload.ErrorMessage) ?? rawText}`,
      );
    }
  }

  private async markCredentialRotating(
    credential: DeviceCredentialEntity,
    requestedAt: Date,
    requestId: string,
    reason?: string,
  ): Promise<void> {
    credential.status = 'rotating';
    credential.metadataJson = {
      ...(credential.metadataJson ?? {}),
      rotation: filterEmptyRecord({
        status: 'rotate_requested',
        requestedAt: requestedAt.toISOString(),
        reason: pickString(reason),
        requestId,
      }),
    };
    await this.deviceCredentialRepository.save(credential);
  }

  private async callAliyunRpc(
    businessParams: Record<string, string>,
    requestId: string,
    actionLabel: string,
  ): Promise<Record<string, unknown>> {
    const regionId = resolveAliyunRegion() ?? '';
    const credentials = resolveAliyunCredentials();
    const accessKeyId = credentials?.accessKeyId ?? '';
    const accessKeySecret = credentials?.secretAccessKey ?? '';
    const endpoint = normalizeAliyunEndpoint(
      getEnvString('IOT_ENDPOINT', '') || `iot.${regionId}.aliyuncs.com`,
    );
    const instanceId = getEnvString('IOT_INSTANCE_ID', '') || undefined;

    if (!regionId || !accessKeyId || !accessKeySecret || !endpoint) {
      throw new Error(`Aliyun IoT credentials incomplete for ${actionLabel}`);
    }

    const params: Record<string, string> = {
      AccessKeyId: accessKeyId,
      Format: 'JSON',
      RegionId: regionId,
      SignatureMethod: 'HMAC-SHA1',
      SignatureNonce: crypto.randomUUID(),
      SignatureVersion: '1.0',
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      Version: '2018-01-20',
      ...businessParams,
    };
    if (instanceId) {
      params.IotInstanceId = instanceId;
    }
    params.Signature = signAliyunRpcParams(params, accessKeySecret);

    const response = await fetch(`${endpoint}/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
    });
    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`Aliyun IoT ${actionLabel} failed: ${response.status} ${rawText}`);
    }
    const payload = safeParseJson(rawText);
    if (!payload) {
      throw new Error(`Aliyun IoT ${actionLabel} returned invalid JSON`);
    }
    if (payload.Success === false) {
      const code = pickString(payload.Code) ?? 'unknown';
      throw new Error(
        `Aliyun IoT ${actionLabel} failed: ${code} ${pickString(payload.ErrorMessage) ?? rawText}`,
      );
    }
    return payload;
  }

  private normalizeAliyunDeviceCredentialResponse(
    payload: Record<string, unknown>,
    input: {
      trigger:
        | 'admin.devices.create'
        | 'devices.create'
        | 'admin.devices.provision'
        | 'admin.devices.certificate.rotate';
      deviceName: string;
      productKey: string;
    },
  ): Record<string, unknown> {
    const data = asRecord(payload.Data);
    const region = resolveAliyunRegion() ?? '';
    const endpoint =
      normalizeAliyunEndpoint(
        getEnvString('IOT_ENDPOINT', '') || `iot.${region}.aliyuncs.com`,
      ) || null;
    const deviceSecret =
      pickString(data.DeviceSecret) ?? pickString(payload.DeviceSecret) ?? null;
    const credentialId = pickString(data.IotId) ?? pickString(payload.IotId) ?? null;
    const thingName =
      pickString(data.DeviceName) ?? pickString(payload.DeviceName) ?? input.deviceName;
    return filterEmptyRecord({
      accepted: true,
      trigger: input.trigger,
      status: 'active',
      vendor: 'aliyun',
      mode: 'sync-created',
      requestedAt: new Date().toISOString(),
      credentialId,
      deviceName: thingName,
      thingName,
      deviceSecret,
      endpoint,
      region,
      fingerprint: deviceSecret ? buildFingerprint(deviceSecret) : undefined,
      productKey:
        pickString(data.ProductKey) ?? pickString(payload.ProductKey) ?? input.productKey,
    })!;
  }

  private async tryAwsDeleteStep(
    run: () => Promise<unknown>,
    requestId: string,
    step: string,
  ): Promise<void> {
    try {
      await run();
    } catch (error) {
      if (isAwsResourceMissingError(error)) {
        this.logger.warn(`AWS IoT 删除步骤已跳过 requestId=${requestId} step=${step}`);
        return;
      }
      throw error;
    }
  }

  private async createProvisionRecord(input: {
    tenantId: string;
    deviceId: string;
    vendor: CloudIotVendorName;
    status: string;
    requestPayload: Record<string, unknown>;
    responsePayload: Record<string, unknown>;
    requestId: string;
    errorJson?: Record<string, unknown>;
  }): Promise<IotProvisionRecordEntity> {
    const persistedResponsePayload =
      protectDeviceCredentialPayload(input.responsePayload) ?? input.responsePayload;
    return this.iotProvisionRecordRepository.save(
      this.iotProvisionRecordRepository.create({
        tenantId: input.tenantId,
        deviceId: input.deviceId,
        vendor: input.vendor,
        status: input.status,
        requestPayloadJson: input.requestPayload,
        responsePayloadJson: persistedResponsePayload,
        errorJson: input.errorJson ?? null,
      }),
    );
  }
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isAwsResourceMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const target = error as { name?: string; Code?: string; code?: string };
  return (
    target.name === 'ResourceNotFoundException'
    || target.name === 'NotFoundException'
    || target.Code === 'ResourceNotFoundException'
    || target.code === 'ResourceNotFoundException'
  );
}

function normalizeAliyunEndpoint(value: string): string {
  const endpoint = value.trim().replace(/\/+$/g, '');
  if (!endpoint) {
    return '';
  }
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  return `https://${endpoint}`;
}

function signAliyunRpcParams(
  params: Record<string, string>,
  accessKeySecret: string,
): string {
  const canonicalized = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join('&');
  const stringToSign = `POST&${percentEncode('/')}&${percentEncode(canonicalized)}`;
  return crypto
    .createHmac('sha1', `${accessKeySecret}&`)
    .update(stringToSign)
    .digest('base64');
}

function percentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

function safeParseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function filterEmptyRecord(input: Record<string, unknown>): Record<string, unknown> | null {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== '');
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function buildFingerprint(certificatePem: string): string {
  return crypto.createHash('sha256').update(certificatePem).digest('hex');
}

function isAwsResourceAlreadyExistsError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const name = pickString((error as { name?: unknown }).name);
  return name === 'ResourceAlreadyExistsException';
}
