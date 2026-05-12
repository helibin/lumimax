import { Module } from '@nestjs/common';
import { PersistenceModule } from '../../persistence/persistence.module';
import { AuditLogApplicationService } from './audit-log-application.service';
import { AuditLogService } from './audit-log.service';

@Module({
  imports: [PersistenceModule],
  providers: [AuditLogService, AuditLogApplicationService],
  exports: [AuditLogService, AuditLogApplicationService],
})
export class AuditLogModule {}
