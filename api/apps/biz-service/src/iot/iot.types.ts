import type { CloudIotVendorName } from '@lumimax/config';

export type { CloudIotVendorName } from '@lumimax/config';

export enum BizIotTopicKind {
  CONNECT_REQ = 'connect.req',
  CONNECT_RES = 'connect.res',
  STATUS_REQ = 'status.req',
  EVENT_REQ = 'event.req',
  EVENT_RES = 'event.res',
  ATTR_REQ = 'attr.req',
  ATTR_RES = 'attr.res',
  CMD_REQ = 'cmd.req',
  CMD_RES = 'cmd.res',
}

export interface IncomingBizIotMessage {
  vendor: CloudIotVendorName;
  topic: string;
  payload: unknown;
  receivedAt?: number;
}

export interface NormalizedBizIotMessage {
  vendor: CloudIotVendorName;
  topic: string;
  deviceId: string;
  topicKind: BizIotTopicKind;
  requestId: string;
  event: string;
  locale: string;
  payload: Record<string, unknown>;
  timestamp: number;
  receivedAt: Date;
}

export interface BizIotDownlinkMessage {
  topicKind: BizIotTopicKind;
  event: string;
  data: Record<string, unknown>;
  qos?: 0 | 1;
}

export interface BizIotDispatchResult extends Record<string, unknown> {
  accepted: boolean;
  skipped?: boolean;
  handledBy?: string;
  requestId: string;
  data?: Record<string, unknown>;
  downlink?: BizIotDownlinkMessage;
}
