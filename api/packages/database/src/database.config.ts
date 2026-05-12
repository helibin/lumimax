/*
 * @Author: Lybeen
 * @Email: helibin@139.com
 * @Date: 2026-04-28 18:29:16
 * @LastEditTime: 2026-05-01 18:41:39
 * @LastEditors: Lybeen
 * @FilePath: /@ai/lumimax/api/libs/database/src/database.config.ts
 */
import type { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import { getEnvString } from '@lumimax/config';
import type { MigrationInterface } from 'typeorm';

type MigrationEntry = string | (new () => MigrationInterface);

export interface DatabaseModuleOptions {
  entities: EntityClassOrSchema[];
  migrations?: MigrationEntry[];
  serviceName?: string;
}

export interface DatabaseRuntimeConfig {
  url: string;
  synchronize: boolean;
  logging: boolean;
  migrations: MigrationEntry[];
  serviceName: string;
}

export function resolveDatabaseConfig(
  options: DatabaseModuleOptions,
): DatabaseRuntimeConfig {
  const serviceName =
    options.serviceName?.trim() || getEnvString('SERVICE_NAME')?.trim() || 'app';
  const url = (getEnvString('DB_URL') ?? '').trim();
  if (!url) {
    throw new Error(`[${serviceName}] DB_URL is required`);
  }

  const synchronize = parseBoolean(getEnvString('DB_SYNCHRONIZE'), false);
  const logging = parseBoolean(getEnvString('DB_LOGGING'), false);

  if ((getEnvString('NODE_ENV', 'development') ?? 'development') === 'production' && synchronize) {
    throw new Error(
      `[${serviceName}] DB_SYNCHRONIZE=true is forbidden in production`,
    );
  }

  return {
    url,
    synchronize,
    logging,
    migrations: options.migrations ?? [],
    serviceName,
  };
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value || !value.trim()) {
    return fallback;
  }
  return value.trim().toLowerCase() === 'true';
}
