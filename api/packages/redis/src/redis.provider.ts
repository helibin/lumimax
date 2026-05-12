import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { resolveRedisConfig } from './redis.config';

const logger = new Logger('RedisModule');

export const redisProvider = {
  provide: REDIS_CLIENT,
  useFactory: (): Redis => {
    const config = resolveRedisConfig();
    const client = config.url
      ? new Redis(config.url)
      : new Redis({
          host: config.host,
          port: config.port,
          password: config.password,
          db: config.db,
        });

    client.on('connect', () => {
      logger.log(
        `Redis connected ${JSON.stringify({
          mode: config.url ? 'url' : 'host',
          host: config.host,
          port: config.port,
          db: config.db,
          password: config.password ? 'configured' : 'empty',
        })}`,
      );
    });

    client.on('error', (error: unknown) => {
      logger.error(
        `Redis connection error ${JSON.stringify({
          message: error instanceof Error ? error.message : String(error),
          host: config.host,
          port: config.port,
          db: config.db,
        })}`,
      );
    });

    return client;
  },
};
