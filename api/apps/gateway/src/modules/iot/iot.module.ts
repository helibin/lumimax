import { Module } from '@nestjs/common';
import { GatewayCommonModule } from '../gateway-common.module';
import { InternalIotController } from './internal-iot.controller';
import { InternalMqttAuthService } from './internal-mqtt-auth.service';
import { IotController } from './iot.controller';

@Module({
  imports: [GatewayCommonModule],
  controllers: [IotController, InternalIotController],
  providers: [InternalMqttAuthService],
})
export class IotModule {}
