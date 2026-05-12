import { Inject, Injectable } from '@nestjs/common';
import type { BizIotDispatchResult, NormalizedBizIotMessage } from '../iot.types';
import { IotDispatcherService } from './iot-dispatcher.service';

@Injectable()
export class IotEventDispatcherService {
  constructor(
    @Inject(IotDispatcherService) private readonly iotDispatcherService: IotDispatcherService,
  ) {}

  dispatch(message: NormalizedBizIotMessage): Promise<BizIotDispatchResult> {
    return this.iotDispatcherService.dispatch(message);
  }
}
