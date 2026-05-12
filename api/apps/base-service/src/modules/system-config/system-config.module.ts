import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { PersistenceModule } from '../../persistence/persistence.module';
import { SystemConfigApplicationService } from './system-config-application.service';
import { SystemConfigService } from './system-config.service';

@Module({
  imports: [PersistenceModule, AuditLogModule],
  providers: [SystemConfigService, SystemConfigApplicationService],
  exports: [SystemConfigService, SystemConfigApplicationService],
})
export class SystemConfigModule {}
