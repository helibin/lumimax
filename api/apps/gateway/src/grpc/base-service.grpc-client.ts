import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { BASE_GRPC_SERVICES } from '@lumimax/contracts';
import type { AuthenticatedUser } from '@lumimax/auth';
import type { GatewayGrpcReply } from '@lumimax/integration/grpc/gateway-grpc.util';
import { generateRequestId, getCurrentRequestId } from '@lumimax/runtime';
import {
  stringifyGrpcJson,
  unwrapGatewayGrpcReply,
} from '@lumimax/integration/grpc/gateway-grpc.util';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type { Observable } from 'rxjs';
import { createGrpcMetadata } from '../modules/grpc-metadata.util';

export const BASE_SERVICE_GRPC_CLIENT = 'BASE_SERVICE_GRPC_CLIENT';

interface BaseHealthGrpcApi {
  Ping(
    payload: { request_id: string },
    metadata?: unknown,
  ): Observable<{ service: string; status: string }>;
}

interface BaseSystemFacadeGrpcApi {
  CallAdminSystem(
    payload: {
      request_id: string;
      service: string;
      method: string;
      payload_json: string;
    },
    metadata?: unknown,
  ): Observable<{ json: string }>;
  CallDictionary(
    payload: {
      request_id: string;
      method: string;
      payload_json: string;
    },
    metadata?: unknown,
  ): Observable<{ json: string }>;
}

interface BaseUserFacadeGrpcApi {
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

interface BaseNotificationFacadeGrpcApi {
  Execute(
    payload: {
      operation: string;
      params_json: string;
      query_json: string;
      body_json: string;
      tenant_scope: string;
      request_id: string;
    },
    metadata?: unknown,
  ): Observable<GatewayGrpcReply>;
}

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
  private healthService!: BaseHealthGrpcApi;
  private systemFacadeService!: BaseSystemFacadeGrpcApi;
  private userFacadeService!: BaseUserFacadeGrpcApi;
  private notificationFacadeService!: BaseNotificationFacadeGrpcApi;
  private storageFacadeService!: BaseStorageFacadeGrpcApi;

  constructor(
    @Inject(BASE_SERVICE_GRPC_CLIENT) private readonly grpcClient: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.healthService =
      this.grpcClient.getService<BaseHealthGrpcApi>(BASE_GRPC_SERVICES.health);
    this.systemFacadeService =
      this.grpcClient.getService<BaseSystemFacadeGrpcApi>(BASE_GRPC_SERVICES.admin);
    this.userFacadeService =
      this.grpcClient.getService<BaseUserFacadeGrpcApi>(BASE_GRPC_SERVICES.user);
    this.notificationFacadeService =
      this.grpcClient.getService<BaseNotificationFacadeGrpcApi>(
        BASE_GRPC_SERVICES.notification,
      );
    this.storageFacadeService =
      this.grpcClient.getService<BaseStorageFacadeGrpcApi>(
        BASE_GRPC_SERVICES.storage,
      );
  }

  async ping(requestId: string): Promise<{ service: string; status: string }> {
    return firstValueFrom(
      this.healthService.Ping(
        { request_id: requestId },
        createGrpcMetadata(requestId),
      ),
    );
  }

  async callAdminSystem<T>(input: {
    requestId: string;
    service: string;
    method: string;
    payload: Record<string, unknown>;
  }): Promise<T> {
    const reply = await firstValueFrom(
      this.systemFacadeService.CallAdminSystem(
        {
          request_id: input.requestId,
          service: input.service,
          method: input.method,
          payload_json: JSON.stringify(input.payload ?? {}),
        },
        createGrpcMetadata(input.requestId),
      ),
    );
    return unwrapGatewayGrpcReply<T>(JSON.parse(reply.json || '{}') as GatewayGrpcReply);
  }

  async callDictionary<T>(input: {
    requestId: string;
    method: string;
    payload: Record<string, unknown>;
  }): Promise<T> {
    const reply = await firstValueFrom(
      this.systemFacadeService.CallDictionary(
        {
          request_id: input.requestId,
          method: input.method,
          payload_json: JSON.stringify(input.payload ?? {}),
        },
        createGrpcMetadata(input.requestId),
      ),
    );
    return unwrapGatewayGrpcReply<T>(JSON.parse(reply.json || '{}') as GatewayGrpcReply);
  }

  async executeUser<T>(input: {
    operation: string;
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    user?: AuthenticatedUser;
    tenantScope?: string | null;
    requestId?: string;
  }): Promise<T> {
    const requestId = input.requestId ?? getCurrentRequestId() ?? generateRequestId();
    const reply = await firstValueFrom(
      this.userFacadeService.Execute(
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

  async executeNotification<T>(input: {
    operation: string;
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    tenantScope?: string | null;
    requestId?: string;
  }): Promise<T> {
    const requestId = input.requestId ?? getCurrentRequestId() ?? generateRequestId();
    const reply = await firstValueFrom(
      this.notificationFacadeService.Execute(
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
    return unwrapGatewayGrpcReply<T>(reply);
  }

  async executeStorage<T>(input: {
    operation: string;
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    user?: AuthenticatedUser | Record<string, unknown> | null;
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
export class BaseUserGrpcAdapter {
  constructor(private readonly baseServiceGrpcClient: BaseServiceGrpcClient) {}

  async execute<T>(input: {
    operation: string;
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    user?: AuthenticatedUser;
    tenantScope?: string | null;
    requestId?: string;
  }): Promise<T> {
    return this.baseServiceGrpcClient.executeUser<T>(input);
  }
}

@Injectable()
export class BaseNotificationGrpcAdapter {
  constructor(private readonly baseServiceGrpcClient: BaseServiceGrpcClient) {}

  async execute<T>(input: {
    operation: string;
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    tenantScope?: string | null;
    requestId?: string;
  }): Promise<T> {
    return this.baseServiceGrpcClient.executeNotification<T>(input);
  }
}

@Injectable()
export class BaseStorageGrpcAdapter {
  constructor(private readonly baseServiceGrpcClient: BaseServiceGrpcClient) {}

  async execute<T>(input: {
    operation: string;
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    user?: AuthenticatedUser | Record<string, unknown> | null;
    tenantScope?: string | null;
    requestId?: string;
  }): Promise<T> {
    return this.baseServiceGrpcClient.executeStorage<T>(input);
  }
}

@Injectable()
export class BaseSystemAdminGrpcAdapter {
  constructor(private readonly baseServiceGrpcClient: BaseServiceGrpcClient) {}

  async call<T>(
    service:
      | 'auth'
      | 'accounts'
      | 'dashboard'
      | 'roles'
      | 'permissions'
      | 'menus'
      | 'dictionaries'
      | 'configs'
      | 'auditLogs',
    method: string,
    payload: Record<string, unknown>,
    requestId?: string,
  ): Promise<T> {
    return this.baseServiceGrpcClient.callAdminSystem<T>({
      requestId: requestId ?? '',
      service,
      method,
      payload,
    });
  }
}

@Injectable()
export class BaseSystemGrpcAdapter {
  constructor(private readonly baseServiceGrpcClient: BaseServiceGrpcClient) {}

  async getDictItems(input: {
    dictType: string;
    status?: string;
    requestId?: string;
  }): Promise<{ items: unknown[] }> {
    return this.baseServiceGrpcClient.callDictionary<{ items: unknown[] }>({
      requestId: input.requestId ?? '',
      method: 'GetDictItems',
      payload: {
        dict_type: input.dictType,
        status: input.status ?? '',
      },
    });
  }

  async batchGetDictItems(input: {
    dictTypes: string[];
    status?: string;
    requestId?: string;
  }): Promise<{ groups: Array<{ dict_type: string; items: unknown[] }> }> {
    return this.baseServiceGrpcClient.callDictionary<{
      groups: Array<{ dict_type: string; items: unknown[] }>;
    }>({
      requestId: input.requestId ?? '',
      method: 'BatchGetDictItems',
      payload: {
        dict_types: input.dictTypes,
        status: input.status ?? '',
      },
    });
  }
}
