import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from '@lumimax/database';
import { HealthService } from './health.service';

@Global()
@Module({
  imports: [ConfigModule, DbModule],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
