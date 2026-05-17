import { Inject, Injectable } from '@nestjs/common';
import { normalizeIotVendor, resolveConfiguredIotVendor, type CloudIotVendorName } from '@lumimax/config';
import { IotService } from './iot.service';
import { resolveTenantId } from '../common/tenant-scope.util';
import type { IotProvisioningPort } from './iot-provisioning.port';

@Injectable()
export class IotApplicationService implements IotProvisioningPort {
  constructor(@Inject(IotService) private readonly iotService: IotService) {}

  ingestCloudMessage(input: {
    vendor: string;
    topic: string;
    payloadJson: string;
    receivedAt: number;
    requestId: string;
  }) {
    const vendor = normalizeInboundVendor(input.vendor) ?? resolveConfiguredIotVendor();
    return this.iotService.ingestCloudMessage({
      vendor,
      topic: input.topic,
      payload: JSON.parse(input.payloadJson || '{}') as Record<string, unknown>,
      receivedAt: input.receivedAt,
      requestId: input.requestId,
    });
  }

  callAdminMessage<T>(input: {
    method: string;
    payload?: Record<string, unknown>;
    requestId: string;
  }): Promise<T> {
    const tenantId = resolveTenantId(String(input.payload?.tenantId ?? input.payload?.tenant_id ?? ''));
    if (input.method === 'ListIotMessages') {
      return this.iotService.listMessages({
        tenantId,
        page: Number(input.payload?.page ?? 1),
        pageSize: Number(input.payload?.page_size ?? input.payload?.pageSize ?? 20),
        keyword: String(input.payload?.keyword ?? ''),
      }) as Promise<T>;
    }

    if (input.method === 'GetIotMessage') {
      return this.iotService.getMessage(tenantId, String(input.payload?.id ?? '')) as Promise<T>;
    }

    if (input.method === 'ProvisionOnDeviceCreated') {
      const payload = input.payload ?? {};
      return this.iotService.provisionOnDeviceCreated({
        deviceId: String(payload.deviceId ?? ''),
        deviceSn: String(payload.deviceSn ?? ''),
        provider: String(payload.provider ?? ''),
        productKey: String(payload.productKey ?? ''),
        tenantId: String(payload.tenantId ?? tenantId),
        requestId: input.requestId,
        trigger: payload.trigger as
          | 'admin.devices.create'
          | 'devices.create'
          | 'admin.devices.provision',
      }) as Promise<T>;
    }

    if (input.method === 'RotateDeviceCredential') {
      const payload = input.payload ?? {};
      return this.iotService.rotateDeviceCredential({
        tenantId: String(payload.tenantId ?? tenantId),
        deviceId: String(payload.deviceId ?? ''),
        deviceSn: String(payload.deviceSn ?? ''),
        productKey: payload.productKey ? String(payload.productKey) : undefined,
        vendor: payload.vendor as CloudIotVendorName | undefined,
        requestId: input.requestId,
        reason: payload.reason ? String(payload.reason) : undefined,
      }) as Promise<T>;
    }

    if (input.method === 'DeleteDeviceIdentity') {
      const payload = input.payload ?? {};
      return this.iotService.deleteDeviceIdentity({
        tenantId: String(payload.tenantId ?? tenantId),
        deviceId: String(payload.deviceId ?? ''),
        deviceSn: payload.deviceSn ? String(payload.deviceSn) : undefined,
        productKey: payload.productKey ? String(payload.productKey) : undefined,
        vendor: payload.vendor as CloudIotVendorName | undefined,
        requestId: input.requestId,
      }) as Promise<T>;
    }

    throw new Error(`Unsupported biz iot admin method: ${input.method}`);
  }

  provisionOnDeviceCreated(input: {
    deviceId: string;
    deviceSn: string;
    provider: string;
    productKey: string;
    tenantId: string;
    requestId: string;
    trigger: 'admin.devices.create' | 'devices.create' | 'admin.devices.provision';
  }): Promise<Record<string, unknown>> {
    return this.iotService.provisionOnDeviceCreated(input);
  }

  rotateDeviceCredential(input: {
    tenantId: string;
    deviceId: string;
    deviceSn: string;
    productKey?: string;
    vendor?: CloudIotVendorName;
    requestId: string;
    reason?: string;
  }): Promise<Record<string, unknown>> {
    return this.iotService.rotateDeviceCredential(input);
  }

  deleteDeviceIdentity(input: {
    tenantId: string;
    deviceId: string;
    deviceSn?: string;
    productKey?: string;
    vendor?: CloudIotVendorName;
    requestId: string;
  }): Promise<Record<string, unknown>> {
    return this.iotService.deleteDeviceIdentity(input);
  }
}

function normalizeInboundVendor(value: string | undefined): CloudIotVendorName | undefined {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return undefined;
  }
  return normalizeIotVendor(normalized);
}
