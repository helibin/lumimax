import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AppConfigValues,
  CloudConfigValues,
  CommonConfigRegistry,
  DatabaseConfigValues,
  GatewayConfigValues,
  InfrastructureConfigValues,
} from './config-registry';
import {
  appConfigToken,
  cloudConfigToken,
  databaseConfigToken,
  gatewayConfigToken,
  infrastructureConfigToken,
} from './index';

void ConfigService;

export interface CommonRuntimeConfig {
  app: AppConfigValues;
  infrastructure: InfrastructureConfigValues;
  gateway: GatewayConfigValues;
  database: DatabaseConfigValues;
  aws: CloudConfigValues['aws'];
  aliyun: CloudConfigValues['aliyun'];
}

@Injectable()
export class EnvService {
  private readonly configService: ConfigService<CommonConfigRegistry>;

  constructor(
    configService: ConfigService<CommonConfigRegistry>,
  ) {
    this.configService = configService;
  }

  getString(key: string, fallback?: string): string | undefined {
    return this.configService.get<string>(key as never) ?? fallback;
  }

  getNumber(key: string, fallback?: number): number | undefined {
    const value = this.configService.get<string>(key as never);
    if (value === undefined || value === null || value === '') {
      return fallback;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? fallback : parsed;
  }

  getRequiredString(key: string): string {
    const value = this.configService.get<string>(key as never);
    if (!value) {
      throw new Error(`Missing required env: ${key}`);
    }
    return value;
  }

  getAppConfig(): AppConfigValues {
    return this.configService.get<AppConfigValues>(appConfigToken)!;
  }

  getCloudConfig(): CloudConfigValues {
    return this.configService.get<CloudConfigValues>(cloudConfigToken)!;
  }

  getInfrastructureConfig(): InfrastructureConfigValues {
    return this.configService.get<InfrastructureConfigValues>(
      infrastructureConfigToken,
    )!;
  }

  getGatewayConfig(): GatewayConfigValues {
    return this.configService.get<GatewayConfigValues>(gatewayConfigToken)!;
  }

  getDatabaseConfig(): DatabaseConfigValues {
    return this.configService.get<DatabaseConfigValues>(databaseConfigToken)!;
  }

  getConfig(): CommonRuntimeConfig {
    const cloud = this.getCloudConfig();

    return {
      app: this.getAppConfig(),
      infrastructure: this.getInfrastructureConfig(),
      gateway: this.getGatewayConfig(),
      database: this.getDatabaseConfig(),
      aws: cloud.aws,
      aliyun: cloud.aliyun,
    };
  }
}
