import { Inject, Injectable } from '@nestjs/common';
import type { CloudIotVendorName } from '@lumimax/config';
import { AwsProviderService } from '../providers/aws/aws-provider.service';
import { EmqxProviderService } from '../providers/emqx/emqx-provider.service';
import type { IotEgressAdapter } from '../interfaces/iot-egress-adapter.interface';

@Injectable()
export class IotEgressAdapterRegistry {
  private readonly adapters: Record<CloudIotVendorName, IotEgressAdapter>;

  constructor(
    @Inject(AwsProviderService)
    awsProviderService: AwsProviderService,
    @Inject(EmqxProviderService)
    emqxProviderService: EmqxProviderService,
  ) {
    this.adapters = {
      aws: awsProviderService,
      emqx: emqxProviderService,
    };
  }

  getOrThrow(vendor: CloudIotVendorName): IotEgressAdapter {
    const adapter = this.adapters[vendor];
    if (!adapter) {
      throw new Error(`Unsupported IoT egress adapter vendor: ${vendor}`);
    }
    return adapter;
  }
}
