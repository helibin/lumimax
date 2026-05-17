import { join } from 'node:path';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { BIZ_PROTO_PACKAGE, BIZ_GRPC_SERVICES } from '@lumimax/contracts';
import { getEnvString } from '@lumimax/config';
import {
  generateRequestId,
  getCurrentRequestId,
} from '@lumimax/runtime';
import { ClientGrpc, ClientsModule, Transport } from '@nestjs/microservices';
import { firstValueFrom, type Observable } from 'rxjs';
import { createGrpcMetadata } from './grpc-metadata.util';

export const IOT_SERVICE_GRPC_CLIENT = 'IOT_SERVICE_GRPC_CLIENT';

interface BizIotFacadeGrpcApi {
  CallAdminMessage(
    payload: {
      request_id: string;
      method: string;
      payload_json: string;
    },
    metadata?: unknown,
  ): Observable<{ json: string }>;
}

@Injectable()
export class IotServiceGrpcClient implements OnModuleInit {
  private iotFacadeService!: BizIotFacadeGrpcApi;

  constructor(
    @Inject(IOT_SERVICE_GRPC_CLIENT) private readonly grpcClient: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.iotFacadeService =
      this.grpcClient.getService<BizIotFacadeGrpcApi>(BIZ_GRPC_SERVICES.iot);
  }

  async callIotAdmin<T>(input: {
    method: string;
    payload?: Record<string, unknown>;
    requestId?: string;
  }): Promise<T> {
    const requestId = input.requestId ?? getCurrentRequestId() ?? generateRequestId();
    const reply = await firstValueFrom(
      this.iotFacadeService.CallAdminMessage(
        {
          request_id: requestId,
          method: input.method,
          payload_json: JSON.stringify(input.payload ?? {}),
        },
        createGrpcMetadata(requestId),
      ),
    );
    return JSON.parse(reply.json || '{}') as T;
  }
}

export const iotServiceGrpcClientRegistration = ClientsModule.register([
  {
    name: IOT_SERVICE_GRPC_CLIENT,
    transport: Transport.GRPC,
    options: {
      package: BIZ_PROTO_PACKAGE,
      protoPath: join(process.cwd(), '../../internal/contracts/proto/biz.proto'),
      url: getEnvString('IOT_SERVICE_GRPC_ENDPOINT', '127.0.0.1:4140'),
      loader: {
        keepCase: true,
      },
    },
  },
]);
