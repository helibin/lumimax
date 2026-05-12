import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { PersistenceModule } from '../../persistence/persistence.module';
import { AdminApplicationService } from './admin-application.service';
import { AdminService } from './admin.service';
import { PasswordHashService } from './password-hash.service';
import { SystemInitService } from './system-init.service';

@Module({
  imports: [PersistenceModule, AuditLogModule],
  providers: [AdminService, PasswordHashService, AdminApplicationService, SystemInitService],
  exports: [AdminService, AdminApplicationService, SystemInitService],
})
export class AdminModule {}
