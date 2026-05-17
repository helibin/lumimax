import type { CloudIotVendorName } from '@lumimax/config';

export interface PublishMessage {
  deviceId: string;
  deviceName?: string;
  productKey?: string;
  topic: string;
  payload: Record<string, unknown>;
  qos: 0 | 1;
  requestId: string;
}

export interface PublishConnectionFeedbackInput extends PublishMessage {
  reason: string;
}

export interface IotProvider {
  readonly vendor: CloudIotVendorName;

  publish(input: PublishMessage): Promise<void>;

  publishConnectionFeedback?(input: PublishConnectionFeedbackInput): Promise<boolean>;
}
