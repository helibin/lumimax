import { Controller, Inject } from '@nestjs/common';
import { resolveGrpcRequestId } from '@lumimax/integration/grpc/gateway-grpc.util';
import { GrpcMethod } from '@nestjs/microservices';
import { DeviceService } from '../device/devices/device.service';
import { IotProvisioningGrpcAdapter } from '../device/identity/iot-provisioning.grpc-adapter';
import { DietService } from '../diet/meal/diet.service';

@Controller()
export class BizHealthGrpcController {
  constructor(
    @Inject(DeviceService) private readonly deviceService: DeviceService,
    @Inject(IotProvisioningGrpcAdapter)
    private readonly iotProvisioningAdapter: IotProvisioningGrpcAdapter,
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
        this.iotProvisioningAdapter.getStatus(),
        this.dietService.getStatus(),
      ],
    };
  }
}
