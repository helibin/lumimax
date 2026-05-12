import { Inject, Injectable } from '@nestjs/common';
import { IotApplicationService } from './bridge/iot-application.service';

@Injectable()
export class IotFacade {
  constructor(
    @Inject(IotApplicationService)
    private readonly iotApplicationService: IotApplicationService,
  ) {}

  ingestCloudMessage(input: {
    vendor: string;
    topic: string;
    payloadJson: string;
    receivedAt: number;
    requestId: string;
  }) {
    return this.iotApplicationService.ingestCloudMessage(input);
  }

  callAdminMessage<T>(input: {
    method: string;
    payload?: Record<string, unknown>;
    requestId: string;
  }): Promise<T> {
    return this.iotApplicationService.callAdminMessage<T>(input);
  }
}
