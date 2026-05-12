import { Module } from '@nestjs/common';
import { AuthGuard } from '../../guards/auth.guard';
import { GatewayCommonModule } from '../gateway-common.module';
import { DevicesController } from './devices.controller';

@Module({
  imports: [GatewayCommonModule],
  controllers: [DevicesController],
  providers: [AuthGuard],
})
export class DevicesModule {}
