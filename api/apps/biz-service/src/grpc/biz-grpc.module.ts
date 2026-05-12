import { join } from 'node:path';
import { Global, Module } from '@nestjs/common';
import { getEnvString } from '@lumimax/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { DeviceModule } from '../device/device.module';
import { DietModule } from '../diet/diet.module';
import { IotModule } from '../iot/iot.module';
import {
  BaseServiceGrpcClient,
  BaseStorageGrpcAdapter,
  BIZ_BASE_SERVICE_GRPC_CLIENT,
} from './base-service.grpc-client';
import { BizHealthGrpcController } from './biz-health.grpc.controller';

const GRPC_LOADER_OPTIONS = {
  keepCase: true,
};

@Global()
@Module({
  imports: [
    DeviceModule,
    IotModule,
    DietModule,
    ClientsModule.register([
      {
        name: BIZ_BASE_SERVICE_GRPC_CLIENT,
        transport: Transport.GRPC,
        options: {
          package: 'base',
          protoPath: join(process.cwd(), '../../internal/contracts/proto/base.proto'),
          url: getEnvString('BASE_SERVICE_GRPC_ENDPOINT', '127.0.0.1:4120'),
          loader: GRPC_LOADER_OPTIONS,
        },
      },
    ]),
  ],
  controllers: [BizHealthGrpcController],
  providers: [BaseServiceGrpcClient, BaseStorageGrpcAdapter],
  exports: [BaseServiceGrpcClient, BaseStorageGrpcAdapter],
})
export class BizGrpcModule {}
