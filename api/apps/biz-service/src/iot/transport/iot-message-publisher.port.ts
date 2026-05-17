import type { CloudIotVendorName } from '../iot.types';

export const IOT_MESSAGE_PUBLISHER = Symbol('IOT_MESSAGE_PUBLISHER');

export interface PublishIotUplinkInput {
  vendor: CloudIotVendorName;
  topic: string;
  payload: Record<string, unknown>;
  receivedAt: number;
  requestId: string;
}

export interface PublishIotDownlinkCommandInput {
  direction: 'down';
  provider: 'auto' | CloudIotVendorName;
  messageId: string;
  deviceId: string;
  topic: string;
  event: string;
  payload: Record<string, unknown>;
  requestId: string;
  tenantId?: string;
  qos?: 0 | 1;
  retain?: boolean;
  trace?: Record<string, unknown>;
}

export interface IotMessagePublisherPort {
  isEnabled(): boolean;
  publishUplink(input: PublishIotUplinkInput): Promise<void>;
  publishDownlinkCommand(input: PublishIotDownlinkCommandInput): Promise<void>;
}
