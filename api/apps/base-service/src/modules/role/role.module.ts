import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { PersistenceModule } from '../../persistence/persistence.module';
import { RoleApplicationService } from './role-application.service';
import { RoleService } from './role.service';

@Module({
  imports: [PersistenceModule, AuditLogModule],
  providers: [RoleService, RoleApplicationService],
  exports: [RoleService, RoleApplicationService],
})
export class RoleModule {}
