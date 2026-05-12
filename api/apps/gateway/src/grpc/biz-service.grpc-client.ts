import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { BIZ_GRPC_SERVICES } from '@lumimax/contracts';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type { Observable } from 'rxjs';
import type { AuthenticatedUser } from '@lumimax/auth';
import type { GatewayGrpcReply } from '@lumimax/integration/grpc/gateway-grpc.util';
import { generateRequestId, getCurrentRequestId } from '@lumimax/runtime';
import { resolveConfiguredIotVendor } from '@lumimax/config';
import {
  stringifyGrpcJson,
  unwrapGatewayGrpcReply,
} from '@lumimax/integration/grpc/gateway-grpc.util';
import { createGrpcMetadata } from '../modules/grpc-metadata.util';

export const BIZ_SERVICE_GRPC_CLIENT = 'BIZ_SERVICE_GRPC_CLIENT';

interface BizHealthGrpcApi {
  Ping(
    payload: { request_id: string },
    metadata?: unknown,
  ): Observable<{ service: string; status: string }>;
}

interface BizDeviceFacadeGrpcApi {
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

interface BizDietFacadeGrpcApi {
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
  CallAdmin(
    payload: {
      request_id: string;
      service: string;
      method: string;
      payload_json: string;
    },
    metadata?: unknown,
  ): Observable<{ json: string }>;
}

interface BizIotFacadeGrpcApi {
  IngestCloudMessage(
    payload: {
      request_id: string;
      vendor: string;
      topic: string;
      payload_json: string;
      received_at: number;
    },
    metadata?: unknown,
  ): Observable<{ success: boolean; message: string }>;
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
export class BizServiceGrpcClient implements OnModuleInit {
  private healthService!: BizHealthGrpcApi;
  private deviceFacadeService!: BizDeviceFacadeGrpcApi;
  private dietFacadeService!: BizDietFacadeGrpcApi;
  private iotFacadeService!: BizIotFacadeGrpcApi;

  constructor(
    @Inject(BIZ_SERVICE_GRPC_CLIENT) private readonly grpcClient: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.healthService =
      this.grpcClient.getService<BizHealthGrpcApi>(BIZ_GRPC_SERVICES.health);
    this.deviceFacadeService =
      this.grpcClient.getService<BizDeviceFacadeGrpcApi>(BIZ_GRPC_SERVICES.device);
    this.dietFacadeService =
      this.grpcClient.getService<BizDietFacadeGrpcApi>(BIZ_GRPC_SERVICES.diet);
    this.iotFacadeService =
      this.grpcClient.getService<BizIotFacadeGrpcApi>(BIZ_GRPC_SERVICES.iot);
  }

  async ping(requestId: string): Promise<{ service: string; status: string }> {
    return firstValueFrom(
      this.healthService.Ping(
        { request_id: requestId },
        createGrpcMetadata(requestId),
      ),
    );
  }

  async executeDevice<T>(input: {
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
      this.deviceFacadeService.Execute(
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

  async callDietAdmin<T>(input: {
    service: 'meals' | 'foods' | 'recognitionLogs';
    method: string;
    payload?: Record<string, unknown>;
    requestId?: string;
  }): Promise<T> {
    const requestId = input.requestId ?? getCurrentRequestId() ?? generateRequestId();
    const reply = await firstValueFrom(
      this.dietFacadeService.CallAdmin(
        {
          request_id: requestId,
          service: input.service,
          method: input.method,
          payload_json: JSON.stringify(input.payload ?? {}),
        },
        createGrpcMetadata(requestId),
      ),
    );
    return JSON.parse(reply.json || '{}') as T;
  }

  async executeDiet<T>(input: {
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
      this.dietFacadeService.Execute(
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

  async ingestIotCloudMessage(input: {
    topic: string;
    payload: Record<string, unknown>;
    receivedAt?: number;
    requestId?: string;
  }): Promise<{ success: boolean; message: string }> {
    const requestId = input.requestId ?? getCurrentRequestId() ?? generateRequestId();
    const vendor = resolveConfiguredIotVendor();
    return firstValueFrom(
      this.iotFacadeService.IngestCloudMessage(
        {
          request_id: requestId,
          vendor,
          topic: input.topic,
          payload_json: JSON.stringify(input.payload ?? {}),
          received_at: input.receivedAt ?? Date.now(),
        },
        createGrpcMetadata(requestId),
      ),
    );
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

@Injectable()
export class BizDeviceGrpcAdapter {
  constructor(private readonly bizServiceGrpcClient: BizServiceGrpcClient) {}

  async execute<T>(input: {
    operation: string;
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    user?: AuthenticatedUser;
    tenantScope?: string | null;
    requestId?: string;
  }): Promise<T> {
    return this.bizServiceGrpcClient.executeDevice<T>(input);
  }
}

@Injectable()
export class BizDietAdminGrpcAdapter {
  constructor(private readonly bizServiceGrpcClient: BizServiceGrpcClient) {}

  async call<T>(
    service: 'meals' | 'foods' | 'recognitionLogs',
    method: string,
    payload: Record<string, unknown>,
    requestId: string,
  ): Promise<T> {
    return this.bizServiceGrpcClient.callDietAdmin<T>({
      service,
      method,
      payload,
      requestId,
    });
  }

  async callOne<T>(
    service: 'meals' | 'foods' | 'recognitionLogs',
    method: string,
    payload: Record<string, unknown>,
    requestId: string,
  ): Promise<T> {
    const result = await this.call<T>(service, method, payload, requestId);
    return normalizeJsonReply(result);
  }

  async callList<T>(
    service: 'meals' | 'foods' | 'recognitionLogs',
    method: string,
    payload: Record<string, unknown>,
    requestId: string,
  ): Promise<T> {
    return this.call<T>(service, method, payload, requestId);
  }
}

@Injectable()
export class BizDietGrpcAdapter {
  constructor(private readonly bizServiceGrpcClient: BizServiceGrpcClient) {}

  async execute<T>(input: {
    operation: string;
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    user?: AuthenticatedUser;
    tenantScope?: string | null;
    requestId?: string;
  }): Promise<T> {
    return this.bizServiceGrpcClient.executeDiet<T>(input);
  }
}

@Injectable()
export class BizIotAdminGrpcAdapter {
  constructor(private readonly bizServiceGrpcClient: BizServiceGrpcClient) {}

  async call<T>(
    method: string,
    payload: Record<string, unknown>,
    requestId: string,
  ): Promise<T> {
    return this.bizServiceGrpcClient.callIotAdmin<T>({
      method,
      payload,
      requestId,
    });
  }

  async callOne<T>(
    method: string,
    payload: Record<string, unknown>,
    requestId: string,
  ): Promise<T> {
    const result = await this.call<T>(method, payload, requestId);
    return normalizeJsonReply(result);
  }

  async callList<T>(
    method: string,
    payload: Record<string, unknown>,
    requestId: string,
  ): Promise<T> {
    return this.call<T>(method, payload, requestId);
  }
}

@Injectable()
export class BizIotBridgeGrpcAdapter {
  constructor(private readonly bizServiceGrpcClient: BizServiceGrpcClient) {}

  async ingestCloudMessage(input: {
    topic: string;
    payload: Record<string, unknown>;
    receivedAt?: number;
    requestId?: string;
  }): Promise<{ success: boolean; message: string }> {
    return this.bizServiceGrpcClient.ingestIotCloudMessage(input);
  }
}

function normalizeJsonReply<T>(value: T): T {
  if (value && typeof value === 'object' && 'json' in (value as Record<string, unknown>)) {
    const rawJson = (value as { json?: unknown }).json;
    if (typeof rawJson === 'string') {
      return JSON.parse(rawJson || '{}') as T;
    }
  }
  return value;
}
