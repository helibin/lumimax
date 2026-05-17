import type { CloudIotVendorName } from '../iot.types';

export interface IotCommand {
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
