import type { CloudIotVendorName } from '@lumimax/config';

export const IOT_PROVISIONING = Symbol('IOT_PROVISIONING');

export interface IotProvisioningPort {
  provisionOnDeviceCreated(input: {
    deviceId: string;
    deviceSn: string;
    provider: string;
    productKey: string;
    tenantId: string;
    requestId: string;
    trigger: 'admin.devices.create' | 'devices.create' | 'admin.devices.provision';
  }): Promise<Record<string, unknown>>;
  rotateDeviceCredential(input: {
    tenantId: string;
    deviceId: string;
    deviceSn: string;
    productKey?: string;
    vendor?: CloudIotVendorName;
    requestId: string;
    reason?: string;
  }): Promise<Record<string, unknown>>;
  deleteDeviceIdentity(input: {
    tenantId: string;
    deviceId: string;
    deviceSn?: string;
    productKey?: string;
    vendor?: CloudIotVendorName;
    requestId: string;
  }): Promise<Record<string, unknown>>;
}
