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
  logger.log(
    `TypeORM datasource configured for ${runtime.serviceName}`,
    JSON.stringify({
      serviceName: runtime.serviceName,
      url: 'configured',
      synchronize: runtime.synchronize,
      logging: runtime.logging,
      migrations: runtime.migrations.length,
    }),
  );

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
