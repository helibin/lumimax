import type { CloudIotVendorName } from '@lumimax/config';

export type IotIngressChannel = 'queue' | 'webhook' | 'ingest';

export interface NormalizedCloudIotIngressMessage {
  vendor: CloudIotVendorName;
  topic: string;
  payload: Record<string, unknown>;
  requestId: string;
  receivedAt: number;
}

export interface IotIngressAdapter {
  readonly vendor: CloudIotVendorName;

  supports(channel: IotIngressChannel): boolean;

  normalize(input: {
    channel: IotIngressChannel;
    body: unknown;
  }): NormalizedCloudIotIngressMessage;
}
