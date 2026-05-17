import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseHealthModule } from '@lumimax/database';
import { HealthService } from './health.service';

@Global()
@Module({
  imports: [ConfigModule, DatabaseHealthModule],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
