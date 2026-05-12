import { Module } from '@nestjs/common';
import { GatewayCommonModule } from '../gateway-common.module';
import { InternalIotController } from './internal-iot.controller';
import { IotController } from './iot.controller';

@Module({
  imports: [GatewayCommonModule],
  controllers: [IotController, InternalIotController],
})
export class IotModule {}
