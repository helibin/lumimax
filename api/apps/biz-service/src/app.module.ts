import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolveServiceEnvFilePaths } from '@lumimax/config';
import { HealthModule } from '@lumimax/health';
import { LoggerModule } from '@lumimax/logger';
import { RequestIdMiddleware } from '@lumimax/logger';
import { validateBizServiceEnv } from './config/biz-service.env.validation';
import { BizGrpcModule } from './grpc/biz-grpc.module';
import { HealthController } from './health.controller';
import { PersistenceModule } from './persistence/persistence.module';
import { DeviceModule } from './device/device.module';
import { DietModule } from './diet/diet.module';
import { IotModule } from './iot/iot.module';
import { ThirdPartyAvailabilityService } from './startup/third-party-availability.service';

@Module({
  imports: [
    LoggerModule,
    HealthModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveServiceEnvFilePaths('biz-service'),
      validate: validateBizServiceEnv,
    }),
    PersistenceModule,
    BizGrpcModule,
    DeviceModule,
    IotModule,
    DietModule,
  ],
  controllers: [HealthController],
  providers: [ThirdPartyAvailabilityService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
