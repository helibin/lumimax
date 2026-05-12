import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import {
  generateRequestId,
  getCurrentRequestId,
} from '@lumimax/runtime';
import { AppLogger } from '@lumimax/logger';
import {
  stringifyGrpcJson,
  unwrapGatewayGrpcReply,
} from '@lumimax/integration/grpc/gateway-grpc.util';
import { NOTIFICATION_GRPC_SERVICE } from '@lumimax/contracts';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type { Observable } from 'rxjs';
import { createGrpcMetadata } from '../grpc-metadata.util';
import type { GatewayGrpcReply } from '@lumimax/integration/grpc/gateway-grpc.util';

void AppLogger;

export const NOTIFICATION_GRPC_CLIENT = 'NOTIFICATION_GRPC_CLIENT';

interface NotificationGrpcService {
  Execute(
    payload: {
      operation: string;
      params_json: string;
      query_json: string;
      body_json: string;
      tenant_scope: string;
      request_id: string;
    },
    metadata?: any,
  ): Observable<GatewayGrpcReply>;
}

@Injectable()
export class NotificationGrpcClient implements OnModuleInit {
  private notificationService!: NotificationGrpcService;
  private readonly grpcClient: ClientGrpc;
  private readonly logger: AppLogger;

  constructor(
    @Inject(NOTIFICATION_GRPC_CLIENT) grpcClient: ClientGrpc,
    logger: AppLogger,
  ) {
    this.grpcClient = grpcClient;
    this.logger = logger;
  }

  onModuleInit(): void {
    this.notificationService =
      this.grpcClient.getService<NotificationGrpcService>(NOTIFICATION_GRPC_SERVICE);
  }

  async execute<T>(input: {
    operation: string;
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    tenantScope?: string | null;
    requestId?: string;
  }): Promise<T> {
    const requestId = input.requestId ?? getCurrentRequestId() ?? generateRequestId();
    const reply = await firstValueFrom(
      this.notificationService.Execute(
        {
          operation: input.operation,
          params_json: stringifyGrpcJson(input.params ?? {}),
          query_json: stringifyGrpcJson(input.query ?? {}),
          body_json: stringifyGrpcJson(input.body ?? {}),
          tenant_scope: input.tenantScope ?? '',
          request_id: requestId,
        },
        createGrpcMetadata(requestId),
      ),
    );

    this.logger.debug('网关通知服务 gRPC 调用完成', {
      requestId,
      operation: input.operation,
    }, NotificationGrpcClient.name);

    return unwrapGatewayGrpcReply<T>(reply);
  }
}
