import { Module } from '@nestjs/common';
import { AuthModule } from '../modules/auth/auth.module';
import { NotificationModule } from '../modules/notification/notification.module';
import { StorageModule } from '../modules/storage/storage.module';
import { SystemModule } from '../modules/system/system.module';
import { UserModule } from '../modules/user/user.module';
import { BaseHealthGrpcController } from './base-health.grpc.controller';

@Module({
  imports: [AuthModule, UserModule, SystemModule, NotificationModule, StorageModule],
  controllers: [BaseHealthGrpcController],
})
export class BaseGrpcModule {}
