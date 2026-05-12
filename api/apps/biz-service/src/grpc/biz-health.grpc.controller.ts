import { Controller, Inject } from '@nestjs/common';
import { resolveGrpcRequestId } from '@lumimax/integration/grpc/gateway-grpc.util';
import { GrpcMethod } from '@nestjs/microservices';
import { DeviceService } from '../device/devices/device.service';
import { DietService } from '../diet/meal/diet.service';
import { IotService } from '../iot/bridge/iot.service';

@Controller()
export class BizHealthGrpcController {
  constructor(
    @Inject(DeviceService) private readonly deviceService: DeviceService,
    @Inject(IotService) private readonly iotService: IotService,
    @Inject(DietService) private readonly dietService: DietService,
  ) {}

  @GrpcMethod('BizHealthService', 'Ping')
  ping(payload?: { request_id?: string }, metadata?: unknown) {
    return {
      service: 'biz-service',
      status: 'ok',
      requestId: resolveGrpcRequestId(payload?.request_id, metadata),
      modules: [
        this.deviceService.getStatus(),
        this.iotService.getStatus(),
        this.dietService.getStatus(),
      ],
    };
  }
}
