import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { AccessControlModule } from '@lumimax/auth';
import { EnvModule } from '@lumimax/config';
import { HealthModule } from '@lumimax/health';
import { LoggerModule } from '@lumimax/logger';
import { RequestIdMiddleware } from '@lumimax/logger';
import { DocsModule } from './docs/docs.module';
import { GatewayGrpcModule } from './grpc/gateway-grpc.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { DevicesModule } from './modules/devices/devices.module';
import { FoodsModule } from './modules/foods/foods.module';
import { GatewayCommonModule } from './modules/gateway-common.module';
import { IotModule } from './modules/iot/iot.module';
import { MealsModule } from './modules/meals/meals.module';
import { StorageModule } from './modules/storage/storage.module';
import { SystemModule } from './modules/system/system.module';
import { UsersModule } from './modules/users/users.module';
import { GatewayRateLimitMiddleware } from './rate-limit/gateway-rate-limit.middleware';
import { GatewayRateLimitService } from './rate-limit/gateway-rate-limit.service';

@Module({
  imports: [
    EnvModule.forRoot(),
    LoggerModule,
    HealthModule,
    AccessControlModule,
    GatewayGrpcModule,
    GatewayCommonModule,
    DocsModule,
    AuthModule,
    UsersModule,
    StorageModule,
    DevicesModule,
    MealsModule,
    FoodsModule,
    IotModule,
    SystemModule,
    AdminModule,
  ],
  controllers: [],
  providers: [
    GatewayRateLimitService,
    GatewayRateLimitMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware, GatewayRateLimitMiddleware)
      .forRoutes('*');
  }
}
