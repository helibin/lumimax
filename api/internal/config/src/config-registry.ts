import type { AppConfigValues } from './app.config';
import { AppConfig } from './app.config';
import type { appConfigToken } from './app.config';
import type { CloudConfigValues } from './cloud.config';
import { CloudConfig } from './cloud.config';
import type { cloudConfigToken } from './cloud.config';
import type { DatabaseConfigValues } from './database.config';
import { DatabaseConfig } from './database.config';
import type { databaseConfigToken } from './database.config';
import type { GatewayConfigValues } from './gateway.config';
import { GatewayConfig } from './gateway.config';
import type { gatewayConfigToken } from './gateway.config';
import type { InfrastructureConfigValues } from './infrastructure.config';
import { InfrastructureConfig } from './infrastructure.config';
import type { infrastructureConfigToken } from './infrastructure.config';

export type { AppConfigValues } from './app.config';
export type { CloudConfigValues } from './cloud.config';
export type { DatabaseConfigValues } from './database.config';
export type { GatewayConfigValues } from './gateway.config';
export type { InfrastructureConfigValues } from './infrastructure.config';

export interface CommonConfigRegistry {
  [appConfigToken]: AppConfigValues;
  [cloudConfigToken]: CloudConfigValues;
  [databaseConfigToken]: DatabaseConfigValues;
  [gatewayConfigToken]: GatewayConfigValues;
  [infrastructureConfigToken]: InfrastructureConfigValues;
}

export const commonConfigLoaders = [
  AppConfig,
  CloudConfig,
  DatabaseConfig,
  GatewayConfig,
  InfrastructureConfig,
];
