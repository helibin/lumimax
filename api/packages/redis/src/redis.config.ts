import { getEnvNumber, getEnvString } from '@lumimax/config';

export interface RedisRuntimeConfig {
  url?: string;
  host: string;
  port: number;
  password?: string;
  db: number;
}

export function resolveRedisConfig(): RedisRuntimeConfig {
  return {
    url: normalizeOptional(getEnvString('REDIS_URL')),
    host: normalizeOptional(getEnvString('REDIS_HOST')) ?? 'localhost',
    port: getEnvNumber('REDIS_PORT', 6379),
    password: normalizeOptional(getEnvString('REDIS_PASSWORD')),
    db: getEnvNumber('REDIS_DB', 0),
  };
}

function normalizeOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
