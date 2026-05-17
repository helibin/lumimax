import { Module } from '@nestjs/common';
import { IotModule } from '../iot/iot.module';
import { PersistenceModule } from '../persistence/persistence.module';
import { DeviceBindingService } from './bindings/device-binding.service';
import { DeviceController } from './devices/device.controller';
import { DeviceApplicationService } from './devices/device-application.service';
import { DeviceIdentityModule } from './identity/device-identity.module';
import { DeviceIotModule } from './device-iot.module';
import { DeviceFacadeGrpcController } from './device.facade.grpc.controller';
import { DEVICE_OPERATION_PORT } from './device-operation.port';
import { DeviceFacade } from './device.facade';
import { DeviceService } from './devices/device.service';
import { OtaService } from './ota/ota.service';
import { DevicePresenceMonitorService } from './telemetry/device-presence-monitor.service';

@Module({
  imports: [PersistenceModule, DeviceIotModule, DeviceIdentityModule, IotModule],
  controllers: [DeviceController, DeviceFacadeGrpcController],
  providers: [
    DeviceService,
    DeviceApplicationService,
    DeviceFacade,
    {
      provide: DEVICE_OPERATION_PORT,
      useExisting: DeviceFacade,
    },
    DeviceBindingService,
    DevicePresenceMonitorService,
    OtaService,
  ],
  exports: [
    DeviceService,
    DeviceIotModule,
    DeviceIdentityModule,
    DeviceApplicationService,
    DeviceFacade,
    DEVICE_OPERATION_PORT,
    DeviceBindingService,
    DevicePresenceMonitorService,
    OtaService,
  ],
})
export class DeviceModule {}
