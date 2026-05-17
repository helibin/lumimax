import { Inject, Injectable } from '@nestjs/common';
import type { CloudIotVendorName } from '@lumimax/config';
import { AwsProviderService } from '../providers/aws/aws-provider.service';
import { EmqxProviderService } from '../providers/emqx/emqx-provider.service';
import type { IotProvider } from '../interfaces/iot-provider.interface';

@Injectable()
export class IotProviderRegistry {
  private readonly providers: Record<CloudIotVendorName, IotProvider>;

  constructor(
    @Inject(AwsProviderService)
    awsProviderService: AwsProviderService,
    @Inject(EmqxProviderService)
    emqxProviderService: EmqxProviderService,
  ) {
    this.providers = {
      aws: awsProviderService,
      emqx: emqxProviderService,
    };
  }

  getOrThrow(vendor: CloudIotVendorName): IotProvider {
    const provider = this.providers[vendor];
    if (!provider) {
      throw new Error(`Unsupported IoT provider: ${vendor}`);
    }
    return provider;
  }
}
