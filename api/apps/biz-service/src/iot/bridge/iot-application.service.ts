import { Inject, Injectable } from '@nestjs/common';
import { normalizeIotVendor, resolveConfiguredIotVendor, type CloudIotVendorName } from '@lumimax/config';
import { IotService } from './iot.service';
import { resolveTenantId } from '../../common/tenant-scope.util';

@Injectable()
export class IotApplicationService {
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

  rotateDeviceCertificate(input: {
    tenantId: string;
    deviceId: string;
    deviceSn: string;
    productKey?: string;
    vendor?: CloudIotVendorName;
    requestId: string;
    reason?: string;
  }): Promise<Record<string, unknown>> {
    return this.iotService.rotateDeviceCertificate(input);
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
