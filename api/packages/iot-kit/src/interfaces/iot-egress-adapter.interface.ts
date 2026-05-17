import type { CloudIotVendorName } from '@lumimax/config';

export interface IotDownstreamMessage {
  deviceId: string;
  deviceName?: string;
  productKey?: string;
  topic: string;
  payload: Record<string, unknown>;
  qos: 0 | 1;
  requestId: string;
}

export interface IotConnectionFeedbackMessage extends IotDownstreamMessage {
  reason: string;
}

export interface IotEgressAdapter {
  readonly vendor: CloudIotVendorName;

  publishDownstream(input: IotDownstreamMessage): Promise<void>;

  publishConnectionFeedback?(input: IotConnectionFeedbackMessage): Promise<boolean>;
}
