import { Module } from '@nestjs/common';
import { AccessControlModule } from '@lumimax/auth';
import { GrpcInvokerService } from '../grpc-invoker.service';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminNotificationController } from './proxy/admin-notification.controller';
import { AdminJwtGuard } from './auth/admin-jwt.guard';
import { AdminPermissionGuard } from './auth/admin-permission.guard';
import { AdminBusinessController } from './proxy/admin-business.controller';
import { AdminSystemController } from './system/admin-system.controller';
import { AdminSystemSetupController } from './system/admin-system-setup.controller';

@Module({
  imports: [AccessControlModule],
  controllers: [
    AdminAuthController,
    AdminBusinessController,
    AdminNotificationController,
    AdminSystemController,
    AdminSystemSetupController,
  ],
  providers: [
    GrpcInvokerService,
    AdminAuthService,
    AdminJwtGuard,
    AdminPermissionGuard,
  ],
})
export class AdminModule {}
