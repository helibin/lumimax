import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { generateRequestId, getCurrentRequestId } from '@lumimax/runtime';
import { type CloudIotVendorName } from '@lumimax/config';
import { AppLogger } from '@lumimax/logger';
import { IOT_BRIDGE_GRPC_SERVICE } from '@lumimax/contracts';
import type { Metadata } from '@grpc/grpc-js';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type { Observable } from 'rxjs';
import { createGrpcMetadata } from '../grpc-metadata.util';

void AppLogger;

export const IOT_BRIDGE_GRPC_CLIENT = 'IOT_BRIDGE_GRPC_CLIENT';

export interface IngestCloudMessageInput {
  vendor: CloudIotVendorName;
  topic: string;
  payload: Record<string, unknown>;
  receivedAt?: number;
  requestId?: string;
}

export interface GetDeviceCredentialInput {
  vendor: CloudIotVendorName;
  deviceId: string;
  requestId?: string;
}

export interface GetDeviceCredentialMetaInput {
  vendor: CloudIotVendorName;
  deviceId: string;
  requestId?: string;
}

interface IotBridgeGrpcApi {
  IngestCloudMessage(
    payload: {
      vendor: string;
      topic: string;
      payload_json: string;
      received_at: number;
    },
    metadata?: Metadata,
  ): Observable<{ success: boolean; message: string }>;
  GetDeviceCredential(
    payload: {
      vendor: string;
      deviceId?: string;
      device_id: string;
    },
    metadata?: Metadata,
  ): Observable<{
    vendor: number;
    device_id: string;
    credential_json: string;
    claimed_at: number;
  }>;
  GetDeviceCredentialMeta(
    payload: {
      vendor: string;
      deviceId?: string;
      device_id: string;
    },
    metadata?: Metadata,
  ): Observable<{
    vendor: number;
    device_id: string;
    credential_type: string;
    status: string;
    created_at: number;
    updated_at: number;
    last_claimed_at: number;
  }>;
}

@Injectable()
export class IotBridgeGrpcClient implements OnModuleInit {
  private iotBridgeService!: IotBridgeGrpcApi;

  constructor(
    @Inject(IOT_BRIDGE_GRPC_CLIENT) private readonly grpcClient: ClientGrpc,
    private readonly logger: AppLogger,
  ) {}

  onModuleInit(): void {
    this.iotBridgeService = this.grpcClient.getService<IotBridgeGrpcApi>(
      IOT_BRIDGE_GRPC_SERVICE,
    );
  }

  async ingestCloudMessage(input: IngestCloudMessageInput): Promise<{ success: boolean; message: string }> {
    const requestId = input.requestId ?? getCurrentRequestId() ?? generateRequestId();
    const output = await firstValueFrom(
      this.iotBridgeService.IngestCloudMessage(
        {
          vendor: toProtoVendor(input.vendor),
          topic: input.topic,
          payload_json: JSON.stringify(input.payload ?? {}),
          received_at: input.receivedAt ?? Date.now(),
        },
        createGrpcMetadata(requestId),
      ),
    );

    this.logger.debug(
      'iot-bridge ingest rpc completed',
      {
        requestId,
        vendor: input.vendor,
        topic: input.topic,
      },
      IotBridgeGrpcClient.name,
    );

    return output;
  }

  async getDeviceCredential(input: GetDeviceCredentialInput): Promise<{
    vendor: number;
    device_id: string;
    credential_json: string;
    claimed_at: number;
  }> {
    const requestId = input.requestId ?? getCurrentRequestId() ?? generateRequestId();
    const raw = await firstValueFrom(
      this.iotBridgeService.GetDeviceCredential(
        {
          vendor: toProtoVendor(input.vendor),
          deviceId: input.deviceId,
          device_id: input.deviceId,
        },
        createGrpcMetadata(requestId),
      ),
    );
    const normalized = raw as unknown as {
      vendor: number;
      device_id?: string;
      deviceId?: string;
      credential_json?: string;
      credentialJson?: string;
      claimed_at?: number;
      claimedAt?: number;
    };
    return {
      vendor: normalized.vendor,
      device_id: normalized.device_id ?? normalized.deviceId ?? '',
      credential_json: normalized.credential_json ?? normalized.credentialJson ?? '',
      claimed_at: Number(normalized.claimed_at ?? normalized.claimedAt ?? 0),
    };
  }

  async getDeviceCredentialMeta(input: GetDeviceCredentialMetaInput): Promise<{
    vendor: number;
    device_id: string;
    credential_type: string;
    status: string;
    created_at: number;
    updated_at: number;
    last_claimed_at: number;
  }> {
    const requestId = input.requestId ?? getCurrentRequestId() ?? generateRequestId();
    const raw = await firstValueFrom(
      this.iotBridgeService.GetDeviceCredentialMeta(
        {
          vendor: toProtoVendor(input.vendor),
          deviceId: input.deviceId,
          device_id: input.deviceId,
        },
        createGrpcMetadata(requestId),
      ),
    );
    const normalized = raw as unknown as {
      vendor: number;
      device_id?: string;
      deviceId?: string;
      credential_type?: string;
      credentialType?: string;
      status?: string;
      created_at?: number;
      createdAt?: number;
      updated_at?: number;
      updatedAt?: number;
      last_claimed_at?: number;
      lastClaimedAt?: number;
    };
    return {
      vendor: normalized.vendor,
      device_id: normalized.device_id ?? normalized.deviceId ?? '',
      credential_type: normalized.credential_type ?? normalized.credentialType ?? '',
      status: normalized.status ?? '',
      created_at: Number(normalized.created_at ?? normalized.createdAt ?? 0),
      updated_at: Number(normalized.updated_at ?? normalized.updatedAt ?? 0),
      last_claimed_at: Number(normalized.last_claimed_at ?? normalized.lastClaimedAt ?? 0),
    };
  }
}

function toProtoVendor(vendor: CloudIotVendorName): string {
  return vendor;
}
