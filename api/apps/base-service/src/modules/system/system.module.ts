import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { DictionaryModule } from '../dictionary/dictionary.module';
import { MenuModule } from '../menu/menu.module';
import { PermissionModule } from '../permission/permission.module';
import { RoleModule } from '../role/role.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { SystemController } from './system.controller';
import { SystemAdminRouterService } from './system-admin-router.service';
import { SystemFacadeGrpcController } from './system-facade.grpc.controller';
import { SystemFacadeService } from './system-facade.service';
import { SystemService } from './system.service';

@Module({
  imports: [
    AdminModule,
    RoleModule,
    PermissionModule,
    MenuModule,
    DictionaryModule,
    SystemConfigModule,
    AuditLogModule,
  ],
  controllers: [SystemController, SystemFacadeGrpcController],
  providers: [
    SystemService,
    SystemAdminRouterService,
    SystemFacadeService,
  ],
  exports: [
    SystemService,
    SystemAdminRouterService,
    SystemFacadeService,
  ],
})
export class SystemModule {}
