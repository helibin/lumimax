import { Module } from '@nestjs/common';
import { PersistenceModule } from '../../persistence/persistence.module';
import { PermissionApplicationService } from './permission-application.service';
import { PermissionService } from './permission.service';

@Module({
  imports: [PersistenceModule],
  providers: [PermissionService, PermissionApplicationService],
  exports: [PermissionService, PermissionApplicationService],
})
export class PermissionModule {}
