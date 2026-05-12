import { Module } from '@nestjs/common';
import { GatewayCommonModule } from '../gateway-common.module';
import { DictController } from './dict.controller';
import { HealthController } from './health.controller';
import { SystemController } from './system.controller';

@Module({
  imports: [GatewayCommonModule],
  controllers: [HealthController, DictController, SystemController],
})
export class SystemModule {}
