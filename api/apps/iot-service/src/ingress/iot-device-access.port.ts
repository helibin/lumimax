import type { BizIotTopicKind } from '../iot.types';

export const IOT_DEVICE_ACCESS = Symbol('IOT_DEVICE_ACCESS');

export type DeviceMqttAction = 'publish' | 'subscribe';

export interface DeviceAccessAuthInput {
  clientId: string;
  deviceId?: string | null;
  tenantId?: string | null;
  vendor?: string | null;
  certificateFingerprint?: string | null;
  credentialId?: string | null;
}

export interface DeviceTopicAccessInput extends DeviceAccessAuthInput {
  action: DeviceMqttAction;
  topic: string;
}

export interface DeviceAccessDecision {
  allowed: boolean;
  deviceId: string | null;
  tenantId: string | null;
  reason?: string;
  deviceStatus?: string | null;
  credentialStatus?: string | null;
  credentialId?: string | null;
  fingerprint?: string | null;
}

export interface DeviceTopicAccessDecision extends DeviceAccessDecision {
  topic?: string;
  topicKind?: BizIotTopicKind;
  topicDirection?: 'req' | 'res';
  topicCategory?: 'connect' | 'status' | 'event' | 'attr' | 'cmd';
  action?: DeviceMqttAction;
}

export interface IotDeviceAccessPort {
  validateAuthentication(input: DeviceAccessAuthInput): Promise<DeviceAccessDecision>;
  validateTopicAccess(input: DeviceTopicAccessInput): Promise<DeviceTopicAccessDecision>;
}
