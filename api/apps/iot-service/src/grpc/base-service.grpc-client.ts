import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import {
  generateRequestId,
  getCurrentRequestId,
} from '@lumimax/runtime';
import type { GatewayGrpcReply } from '@lumimax/integration/grpc/gateway-grpc.util';
import {
  stringifyGrpcJson,
  unwrapGatewayGrpcReply,
} from '@lumimax/integration/grpc/gateway-grpc.util';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type { Observable } from 'rxjs';
import { createGrpcMetadata } from './grpc-metadata.util';

export const BIZ_BASE_SERVICE_GRPC_CLIENT = 'BIZ_BASE_SERVICE_GRPC_CLIENT';

interface BaseStorageFacadeGrpcApi {
  Execute(
    payload: {
      operation: string;
      params_json: string;
      query_json: string;
      body_json: string;
      user_json: string;
      tenant_scope: string;
      request_id: string;
    },
    metadata?: unknown,
  ): Observable<GatewayGrpcReply>;
}

@Injectable()
export class BaseServiceGrpcClient implements OnModuleInit {
  private storageFacadeService!: BaseStorageFacadeGrpcApi;

  constructor(
    @Inject(BIZ_BASE_SERVICE_GRPC_CLIENT)
    private readonly grpcClient: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.storageFacadeService =
      this.grpcClient.getService<BaseStorageFacadeGrpcApi>(
        'BaseStorageFacadeService',
      );
  }

  async executeStorage<T>(input: {
    operation: string;
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    user?: Record<string, unknown> | null;
    tenantScope?: string | null;
    requestId?: string;
  }): Promise<T> {
    const requestId = input.requestId ?? getCurrentRequestId() ?? generateRequestId();
    const reply = await firstValueFrom(
      this.storageFacadeService.Execute(
        {
          operation: input.operation,
          params_json: stringifyGrpcJson(input.params ?? {}),
          query_json: stringifyGrpcJson(input.query ?? {}),
          body_json: stringifyGrpcJson(input.body ?? {}),
          user_json: stringifyGrpcJson(input.user ?? null),
          tenant_scope: input.tenantScope ?? '',
          request_id: requestId,
        },
        createGrpcMetadata(requestId),
      ),
    );
    return unwrapGatewayGrpcReply<T>(reply);
  }
}

@Injectable()
export class BaseStorageGrpcAdapter {
  constructor(private readonly baseServiceGrpcClient: BaseServiceGrpcClient) {}

  execute<T>(input: {
    operation: string;
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    user?: Record<string, unknown> | null;
    tenantScope?: string | null;
    requestId?: string;
  }): Promise<T> {
    return this.baseServiceGrpcClient.executeStorage<T>(input);
  }

  validateObjectKeys<T>(body: Record<string, unknown>, requestId?: string): Promise<T> {
    return this.execute<T>({
      operation: 'storage.validateObjectKeys',
      body,
      requestId,
    });
  }

  confirmUploadedObjects<T>(
    body: Record<string, unknown>,
    requestId?: string,
  ): Promise<T> {
    return this.execute<T>({
      operation: 'storage.confirmUploadedObjects',
      body,
      requestId,
    });
  }

  promoteObjectKey<T>(body: Record<string, unknown>, requestId?: string): Promise<T> {
    return this.execute<T>({
      operation: 'storage.promoteObjectKey',
      body,
      requestId,
    });
  }

  createSignedReadUrl<T>(body: Record<string, unknown>, requestId?: string): Promise<T> {
    return this.execute<T>({
      operation: 'storage.createSignedReadUrl',
      body,
      requestId,
    });
  }
}
