/*
 * @Author: Lybeen
 * @Email: helibin@139.com
 * @Date: 2026-04-28 18:29:16
 * @LastEditTime: 2026-05-14 10:43:59
 * @LastEditors: Lybeen
 * @FilePath: /@ai/lumimax/api/packages/database/src/typeorm-options.factory.ts
 */
import { Logger } from '@nestjs/common';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { DatabaseModuleOptions } from './database.config';
import { resolveDatabaseConfig } from './database.config';
import { AppNamingStrategy } from './naming-strategy';

const logger = new Logger('DatabaseModule');

export function createTypeOrmOptions(
  options: DatabaseModuleOptions,
): TypeOrmModuleOptions {
  const runtime = resolveDatabaseConfig(options);

  return {
    type: 'postgres',
    url: runtime.url,
    entities: options.entities,
    migrations: runtime.migrations,
    namingStrategy: new AppNamingStrategy(),
    migrationsRun: runtime.migrations.length > 0,
    synchronize: runtime.synchronize,
    logging: runtime.logging,
    extra: {
      options: '-c timezone=UTC',
    },
    retryAttempts: 3,
    retryDelay: 1000,
  };
}
