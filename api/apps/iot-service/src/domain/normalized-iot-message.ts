import type { CloudIotVendorName } from '../iot.types';

export interface NormalizedIotMessage {
  vendor: CloudIotVendorName;
  deviceId: string;
  topic: string;
  topicKind: string;
  requestId: string;
  event: string;
  locale: string;
  payload: Record<string, unknown>;
  timestamp: number;
  receivedAt: Date;
}
