import { Inject, Injectable } from '@nestjs/common';
import type { CloudIotVendorName } from '@lumimax/config';
import { AwsIngressAdapterService } from '../providers/aws/aws-ingress-adapter.service';
import { EmqxIngressAdapterService } from '../providers/emqx/emqx-ingress-adapter.service';
import type {
  IotIngressAdapter,
  IotIngressChannel,
} from '../interfaces/iot-ingress-adapter.interface';

@Injectable()
export class IotIngressAdapterRegistry {
  private readonly adapters: Record<CloudIotVendorName, IotIngressAdapter>;

  constructor(
    @Inject(AwsIngressAdapterService)
    awsIngressAdapterService: AwsIngressAdapterService,
    @Inject(EmqxIngressAdapterService)
    emqxIngressAdapterService: EmqxIngressAdapterService,
  ) {
    this.adapters = {
      aws: awsIngressAdapterService,
      emqx: emqxIngressAdapterService,
    };
  }

  getOrThrow(vendor: CloudIotVendorName, channel: IotIngressChannel): IotIngressAdapter {
    const adapter = this.adapters[vendor];
    if (!adapter) {
      throw new Error(`Unsupported IoT ingress adapter vendor: ${vendor}`);
    }
    if (!adapter.supports(channel)) {
      throw new Error(`Unsupported IoT ingress channel: vendor=${vendor} channel=${channel}`);
    }
    return adapter;
  }
}
