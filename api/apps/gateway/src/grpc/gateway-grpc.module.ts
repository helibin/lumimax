import { join } from 'node:path';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BASE_PROTO_PACKAGE, BIZ_PROTO_PACKAGE } from '@lumimax/contracts';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  BASE_SERVICE_GRPC_CLIENT,
  BaseNotificationGrpcAdapter,
  BaseServiceGrpcClient,
  BaseStorageGrpcAdapter,
  BaseSystemAdminGrpcAdapter,
  BaseSystemGrpcAdapter,
  BaseUserGrpcAdapter,
} from './base-service.grpc-client';
import {
  BIZ_SERVICE_GRPC_CLIENT,
  BizDeviceGrpcAdapter,
  BizDietGrpcAdapter,
  BizDietAdminGrpcAdapter,
  BizIotAdminGrpcAdapter,
  BizIotBridgeGrpcAdapter,
  BizServiceGrpcClient,
  IOT_SERVICE_GRPC_CLIENT,
  IotServiceGrpcClient,
} from './biz-service.grpc-client';

const GRPC_LOADER_OPTIONS = {
  keepCase: true,
};

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: BASE_SERVICE_GRPC_CLIENT,
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: BASE_PROTO_PACKAGE,
            protoPath: join(process.cwd(), '../../internal/contracts/proto/base.proto'),
            url: configService.get<string>('BASE_SERVICE_GRPC_ENDPOINT') ?? '127.0.0.1:4120',
            loader: GRPC_LOADER_OPTIONS,
          },
        }),
      },
      {
        name: BIZ_SERVICE_GRPC_CLIENT,
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: BIZ_PROTO_PACKAGE,
            protoPath: join(process.cwd(), '../../internal/contracts/proto/biz.proto'),
            url: configService.get<string>('BIZ_SERVICE_GRPC_ENDPOINT') ?? '127.0.0.1:4130',
            loader: GRPC_LOADER_OPTIONS,
          },
        }),
      },
      {
        name: IOT_SERVICE_GRPC_CLIENT,
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: BIZ_PROTO_PACKAGE,
            protoPath: join(process.cwd(), '../../internal/contracts/proto/biz.proto'),
            url: configService.get<string>('IOT_SERVICE_GRPC_ENDPOINT') ?? '127.0.0.1:4140',
            loader: GRPC_LOADER_OPTIONS,
          },
        }),
      },
    ]),
  ],
  providers: [
    BaseServiceGrpcClient,
    BaseUserGrpcAdapter,
    BaseNotificationGrpcAdapter,
    BaseStorageGrpcAdapter,
    BaseSystemAdminGrpcAdapter,
    BaseSystemGrpcAdapter,
    BizServiceGrpcClient,
    IotServiceGrpcClient,
    BizDeviceGrpcAdapter,
    BizDietGrpcAdapter,
    BizDietAdminGrpcAdapter,
    BizIotAdminGrpcAdapter,
    BizIotBridgeGrpcAdapter,
  ],
  exports: [
    BaseServiceGrpcClient,
    BaseUserGrpcAdapter,
    BaseNotificationGrpcAdapter,
    BaseStorageGrpcAdapter,
    BaseSystemAdminGrpcAdapter,
    BaseSystemGrpcAdapter,
    BizServiceGrpcClient,
    IotServiceGrpcClient,
    BizDeviceGrpcAdapter,
    BizDietGrpcAdapter,
    BizDietAdminGrpcAdapter,
    BizIotAdminGrpcAdapter,
    BizIotBridgeGrpcAdapter,
  ],
})
export class GatewayGrpcModule {}
