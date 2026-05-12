import { forwardRef, Module } from '@nestjs/common';
import { IotModule } from '../iot/iot.module';
import { PersistenceModule } from '../persistence/persistence.module';
import { DeviceBindingService } from './bindings/device-binding.service';
import { DeviceCommandService } from './commands/device-command.service';
import { DeviceController } from './devices/device.controller';
import { DeviceAccessValidationService } from './devices/device-access-validation.service';
import { DeviceApplicationService } from './devices/device-application.service';
import { DeviceFacadeGrpcController } from './device.facade.grpc.controller';
import { DeviceFacade } from './device.facade';
import { DeviceService } from './devices/device.service';
import { OtaService } from './ota/ota.service';
import { DevicePresenceMonitorService } from './telemetry/device-presence-monitor.service';
import { DeviceTelemetryService } from './telemetry/device-telemetry.service';

@Module({
  imports: [PersistenceModule, forwardRef(() => IotModule)],
  controllers: [DeviceController, DeviceFacadeGrpcController],
  providers: [
    DeviceService,
    DeviceAccessValidationService,
    DeviceApplicationService,
    DeviceFacade,
    DeviceBindingService,
    DeviceCommandService,
    DeviceTelemetryService,
    DevicePresenceMonitorService,
    OtaService,
  ],
  exports: [
    DeviceService,
    DeviceAccessValidationService,
    DeviceApplicationService,
    DeviceFacade,
    DeviceBindingService,
    DeviceCommandService,
    DeviceTelemetryService,
    DevicePresenceMonitorService,
    OtaService,
  ],
})
export class DeviceModule {}
