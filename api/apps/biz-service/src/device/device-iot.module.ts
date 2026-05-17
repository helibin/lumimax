import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { DEVICE_COMMAND_STATUS_PORT } from './commands/device-command-status.port';
import { DeviceCommandService } from './commands/device-command.service';
import { DeviceAccessValidationService } from './devices/device-access-validation.service';
import { DEVICE_CLOUD_INBOUND_PORT } from './devices/device-cloud-inbound.port';
import { DeviceCloudInboundService } from './devices/device-cloud-inbound.service';
import { DeviceTelemetryService } from './telemetry/device-telemetry.service';

@Module({
  imports: [PersistenceModule],
  providers: [
    DeviceAccessValidationService,
    DeviceCommandService,
    {
      provide: DEVICE_COMMAND_STATUS_PORT,
      useExisting: DeviceCommandService,
    },
    DeviceTelemetryService,
    DeviceCloudInboundService,
    {
      provide: DEVICE_CLOUD_INBOUND_PORT,
      useExisting: DeviceCloudInboundService,
    },
  ],
  exports: [
    DeviceAccessValidationService,
    DeviceCommandService,
    DEVICE_COMMAND_STATUS_PORT,
    DeviceTelemetryService,
    DeviceCloudInboundService,
    DEVICE_CLOUD_INBOUND_PORT,
  ],
})
export class DeviceIotModule {}
