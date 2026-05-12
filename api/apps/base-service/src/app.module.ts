import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolveServiceEnvFilePaths } from '@lumimax/config';
import { HealthModule } from '@lumimax/health';
import { LoggerModule } from '@lumimax/logger';
import { RequestIdMiddleware } from '@lumimax/logger';
import { validateBaseServiceEnv } from './config/base-service.env.validation';
import { PersistenceModule } from './persistence/persistence.module';
import { BaseGrpcModule } from './grpc/base-grpc.module';
import { HealthController } from './health.controller';
import { AdminModule } from './modules/admin/admin.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { AuthModule } from './modules/auth/auth.module';
import { DictionaryModule } from './modules/dictionary/dictionary.module';
import { MenuModule } from './modules/menu/menu.module';
import { NotificationModule } from './modules/notification/notification.module';
import { PermissionModule } from './modules/permission/permission.module';
import { RoleModule } from './modules/role/role.module';
import { StorageModule } from './modules/storage/storage.module';
import { SystemModule } from './modules/system/system.module';
import { SystemConfigModule } from './modules/system-config/system-config.module';
import { UserModule } from './modules/user/user.module';

@Module({
  imports: [
    LoggerModule,
    HealthModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveServiceEnvFilePaths('base-service'),
      validate: validateBaseServiceEnv,
    }),
    PersistenceModule,
    BaseGrpcModule,
    AdminModule,
    RoleModule,
    PermissionModule,
    MenuModule,
    DictionaryModule,
    SystemConfigModule,
    AuditLogModule,
    SystemModule,
    UserModule,
    AuthModule,
    NotificationModule,
    StorageModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
