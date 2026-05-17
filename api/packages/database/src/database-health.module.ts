import { Global, Module } from '@nestjs/common';
import { DatabaseHealthService } from './database-health.service';

@Global()
@Module({
  providers: [DatabaseHealthService],
  exports: [DatabaseHealthService],
})
export class DatabaseHealthModule {}
