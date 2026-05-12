import { registerAs } from '@nestjs/config';

export const gatewayConfigToken = 'gateway';

export interface GatewayConfigValues {
  trustProxy: boolean;
  corsOrigin: string;
  rateLimitEnabled: boolean;
  rateLimitCapacity: number;
  rateLimitRefillPerSecond: number;
  rateLimitKeyPrefix: string;
  rateLimitRedisUrl?: string;
  rateLimitSkipPaths: string[];
}

function getNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseCsv(value: string | undefined, fallback: string[]): string[] {
  if (!value || value.trim().length === 0) {
    return fallback;
  }

  const parsed = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return parsed.length > 0 ? parsed : fallback;
}

export const GatewayConfig = registerAs(
  gatewayConfigToken,
  (): GatewayConfigValues => ({
    trustProxy: (process.env.GATEWAY_TRUST_PROXY ?? 'true') !== 'false',
    corsOrigin: process.env.GATEWAY_CORS_ORIGIN ?? '*',
    rateLimitEnabled:
      (process.env.GATEWAY_RATE_LIMIT_ENABLED ?? 'true').toLowerCase() !==
      'false',
    rateLimitCapacity: getNumberEnv('GATEWAY_RATE_LIMIT_CAPACITY', 60),
    rateLimitRefillPerSecond: getNumberEnv(
      'GATEWAY_RATE_LIMIT_REFILL_PER_SECOND',
      30,
    ),
    rateLimitKeyPrefix:
      process.env.GATEWAY_RATE_LIMIT_KEY_PREFIX ?? 'gateway:ratelimit',
    rateLimitRedisUrl: process.env.REDIS_URL ?? undefined,
    rateLimitSkipPaths: parseCsv(process.env.GATEWAY_RATE_LIMIT_SKIP_PATHS, [
      '/health',
      '/api/docs',
      '/api/docs-json',
      '/api/gateway-docs',
      '/favicon.ico',
    ]),
  }),
);
