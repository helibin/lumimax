import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { PersistenceModule } from '../../persistence/persistence.module';
import { MenuApplicationService } from './menu-application.service';
import { MenuService } from './menu.service';

@Module({
  imports: [PersistenceModule, AuditLogModule],
  providers: [MenuService, MenuApplicationService],
  exports: [MenuService, MenuApplicationService],
})
export class MenuModule {}
