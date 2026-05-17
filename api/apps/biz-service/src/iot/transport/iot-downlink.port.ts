import type { BizIotTopicKind, CloudIotVendorName } from '../iot.types';

export const IOT_DOWNLINK = Symbol('IOT_DOWNLINK');

export interface IotDownlinkPort {
  publish(input: {
    vendor: CloudIotVendorName;
    deviceId: string;
    topicKind: BizIotTopicKind;
    payload: Record<string, unknown>;
    requestId: string;
    tenantId?: string;
    qos?: 0 | 1;
    transport?: 'direct' | 'bridge';
  }): Promise<{ topic: string; requestId: string; delivery: 'queued' | 'sent' }>;
}
