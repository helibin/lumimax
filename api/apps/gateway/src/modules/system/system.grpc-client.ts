import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import {
  generateRequestId,
  getCurrentRequestId,
} from '@lumimax/runtime';
import { AppLogger } from '@lumimax/logger';
import { SYSTEM_GRPC_SERVICE } from '@lumimax/contracts';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type { Observable } from 'rxjs';
import { createGrpcMetadata } from '../grpc-metadata.util';

void AppLogger;

export const SYSTEM_GRPC_CLIENT = 'SYSTEM_GRPC_CLIENT';

export interface SystemDictType {
  dict_type: string;
  name: string;
  description: string;
  status: string;
  is_system: boolean;
  sort_order: number;
}

export interface SystemDictItem {
  dict_type: string;
  code: string;
  value: string;
  label: string;
  i18n_key: string;
  status: string;
  sort_order: number;
  color: string;
  extra_json: string;
  is_system: boolean;
}

export interface SystemConfigItem {
  config_key: string;
  config_value: string;
  value_type: string;
  name: string;
  description: string;
  group_code: string;
  status: string;
  is_system: boolean;
}

interface DictionaryGrpcApi {
  ListDictTypes(
    payload: { status?: string },
    metadata?: unknown,
  ): Observable<{ items: SystemDictType[] }>;
  GetDictItems(
    payload: { dict_type: string; status?: string },
    metadata?: unknown,
  ): Observable<{ items: SystemDictItem[] }>;
  GetDictItem(
    payload: { dict_type: string; code?: string; value?: string },
    metadata?: unknown,
  ): Observable<{ item: SystemDictItem }>;
  BatchGetDictItems(
    payload: { dict_types: string[]; status?: string },
    metadata?: unknown,
  ): Observable<{ groups: Array<{ dict_type: string; items: SystemDictItem[] }> }>;
  RefreshDictCache(
    payload: { dict_type?: string },
    metadata?: unknown,
  ): Observable<{ success: boolean }>;
  ListConfigItems(
    payload: { status?: string },
    metadata?: unknown,
  ): Observable<{ items: SystemConfigItem[] }>;
  GetConfigItem(
    payload: { config_key: string },
    metadata?: unknown,
  ): Observable<{ item: SystemConfigItem }>;
}

@Injectable()
export class SystemGrpcClient implements OnModuleInit {
  private dictionaryService!: DictionaryGrpcApi;

  constructor(
    @Inject(SYSTEM_GRPC_CLIENT) private readonly grpcClient: ClientGrpc,
    private readonly logger: AppLogger,
  ) {}

  onModuleInit(): void {
    this.dictionaryService = this.grpcClient.getService<DictionaryGrpcApi>(SYSTEM_GRPC_SERVICE);
  }

  async listDictTypes(input: {
    status?: string;
    requestId?: string;
  }): Promise<{ items: SystemDictType[] }> {
    const requestId = input.requestId ?? getCurrentRequestId() ?? generateRequestId();
    const output = await firstValueFrom(
      this.dictionaryService.ListDictTypes(
        {
          status: input.status ?? '',
        },
        createGrpcMetadata(requestId),
      ),
    );
    this.logger.debug('system listDictTypes rpc completed', { requestId, status: input.status }, SystemGrpcClient.name);
    return output;
  }

  async getDictItems(input: {
    dictType: string;
    status?: string;
    requestId?: string;
  }): Promise<{ items: SystemDictItem[] }> {
    const requestId = input.requestId ?? getCurrentRequestId() ?? generateRequestId();
    const output = await firstValueFrom(
      this.dictionaryService.GetDictItems(
        {
          dict_type: input.dictType,
          status: input.status ?? '',
        },
        createGrpcMetadata(requestId),
      ),
    );
    this.logger.debug('system getDictItems rpc completed', { requestId, dictType: input.dictType }, SystemGrpcClient.name);
    return output;
  }

  async batchGetDictItems(input: {
    dictTypes: string[];
    status?: string;
    requestId?: string;
  }): Promise<{ groups: Array<{ dict_type: string; items: SystemDictItem[] }> }> {
    const requestId = input.requestId ?? getCurrentRequestId() ?? generateRequestId();
    const output = await firstValueFrom(
      this.dictionaryService.BatchGetDictItems(
        {
          dict_types: input.dictTypes,
          status: input.status ?? '',
        },
        createGrpcMetadata(requestId),
      ),
    );
    this.logger.debug('system batchGetDictItems rpc completed', { requestId, count: input.dictTypes.length }, SystemGrpcClient.name);
    return output;
  }

  async refreshDictCache(input: {
    dictType?: string;
    requestId?: string;
  }): Promise<{ success: boolean }> {
    const requestId = input.requestId ?? getCurrentRequestId() ?? generateRequestId();
    const output = await firstValueFrom(
      this.dictionaryService.RefreshDictCache(
        {
          dict_type: input.dictType ?? '',
        },
        createGrpcMetadata(requestId),
      ),
    );
    this.logger.debug('system refreshDictCache rpc completed', { requestId, dictType: input.dictType }, SystemGrpcClient.name);
    return output;
  }

  async listConfigItems(input: {
    status?: string;
    requestId?: string;
  }): Promise<{ items: SystemConfigItem[] }> {
    const requestId = input.requestId ?? getCurrentRequestId() ?? generateRequestId();
    const output = await firstValueFrom(
      this.dictionaryService.ListConfigItems(
        {
          status: input.status ?? '',
        },
        createGrpcMetadata(requestId),
      ),
    );
    this.logger.debug(
      'system listConfigItems rpc completed',
      { requestId, status: input.status },
      SystemGrpcClient.name,
    );
    return output;
  }

  async getConfigItem(input: {
    configKey: string;
    requestId?: string;
  }): Promise<{ item: SystemConfigItem }> {
    const requestId = input.requestId ?? getCurrentRequestId() ?? generateRequestId();
    const output = await firstValueFrom(
      this.dictionaryService.GetConfigItem(
        {
          config_key: input.configKey,
        },
        createGrpcMetadata(requestId),
      ),
    );
    this.logger.debug(
      'system getConfigItem rpc completed',
      { requestId, configKey: input.configKey },
      SystemGrpcClient.name,
    );
    return output;
  }
}
