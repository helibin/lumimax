import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import {
  readLoggerRuntimeConfig,
  ThirdPartyErrorThrottle,
} from '@lumimax/logger';
import { EnvService } from '@lumimax/config';
import { AppLogger } from '@lumimax/logger';
import {
  closeIoredisClient,
  createIoredisClient,
  describeRedisConnectionError,
  maskRedisUrl,
  type IORedisClient,
} from '@lumimax/redis';

void EnvService;
void AppLogger;

interface RateLimitDecision {
  allowed: boolean;
  remainingTokens: number;
  retryAfterMs: number;
  capacity: number;
}

const TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local refillPerSecond = tonumber(ARGV[3])
local requestTokens = tonumber(ARGV[4])
local ttlSeconds = tonumber(ARGV[5])

if not now or not capacity or not refillPerSecond or not requestTokens then
  return {0, 0, 1000}
end

local bucket = redis.call('HMGET', key, 'tokens', 'updatedAt')
local tokens = tonumber(bucket[1])
local updatedAt = tonumber(bucket[2])

if not tokens then
  tokens = capacity
end
if not updatedAt then
  updatedAt = now
end

if now > updatedAt then
  local elapsed = now - updatedAt
  local refill = elapsed * refillPerSecond / 1000
  tokens = math.min(capacity, tokens + refill)
end

local allowed = 0
local retryAfterMs = 0

if tokens >= requestTokens then
  tokens = tokens - requestTokens
  allowed = 1
else
  retryAfterMs = math.ceil((requestTokens - tokens) * 1000 / refillPerSecond)
end

redis.call('HMSET', key, 'tokens', tokens, 'updatedAt', now)
if ttlSeconds and ttlSeconds > 0 then
  redis.call('EXPIRE', key, ttlSeconds)
end

return {allowed, tokens, retryAfterMs}
`;

@Injectable()
export class GatewayRateLimitService implements OnModuleDestroy {
  private client?: IORedisClient;
  private connectPromise?: Promise<void>;
  private nextConnectRetryAt = 0;
  private loggedConnect = false;
  private readonly errorThrottle = new ThirdPartyErrorThrottle({
    throttleMs: readLoggerRuntimeConfig().thirdPartyErrorThrottleMs,
  });
  private redisConnectionMeta: {
    redisUrl?: string;
  } = {};

  private readonly envService: EnvService;
  private readonly logger: AppLogger;

  constructor(
    envService: EnvService,
    logger: AppLogger,
  ) {
    this.envService = envService;
    this.logger = logger;
  }

  async consume(identity: string): Promise<RateLimitDecision> {
    const config = this.envService.getGatewayConfig();
    const capacity = config.rateLimitCapacity;
    const refillPerSecond = config.rateLimitRefillPerSecond;

    if (!config.rateLimitEnabled) {
      return {
        allowed: true,
        remainingTokens: capacity,
        retryAfterMs: 0,
        capacity,
      };
    }

    const connected = await this.ensureClient();
    if (!connected || !this.client) {
      return {
        allowed: true,
        remainingTokens: capacity,
        retryAfterMs: 0,
        capacity,
      };
    }

    const now = Date.now();
    const ttlSeconds = Math.max(Math.ceil((capacity / refillPerSecond) * 2), 60);
    const key = `${config.rateLimitKeyPrefix}:${identity}`;

    try {
      const result = (await this.client.eval(
        TOKEN_BUCKET_SCRIPT,
        1,
        key,
        String(now),
        String(capacity),
        String(refillPerSecond),
        '1',
        String(ttlSeconds),
      )) as [number | string, number | string, number | string];

      const allowed = Number(result[0]) === 1;
      const remainingTokens = Math.max(0, Math.floor(Number(result[1]) || 0));
      const retryAfterMs = Math.max(0, Math.ceil(Number(result[2]) || 0));

      return {
        allowed,
        remainingTokens,
        retryAfterMs,
        capacity,
      };
    } catch (error) {
      const detail = describeRedisConnectionError(error);
      this.logErrorWithCooldown('redis rate limiter unavailable, fallback enabled', {
        ...this.redisConnectionMeta,
        category: detail.category,
        errorCode: detail.errorCode ?? '-',
        errorName: detail.errorName,
        errorMessage: detail.errorMessage,
        hint: detail.hint,
        retryable: detail.retryable,
        fallback: 'fail-open',
      });
      return {
        allowed: true,
        remainingTokens: capacity,
        retryAfterMs: 0,
        capacity,
      };
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await closeIoredisClient(this.client);
    } catch (error) {
      const detail = describeRedisConnectionError(error);
      this.logErrorWithCooldown('gateway rate limit redis close failed', {
        ...this.redisConnectionMeta,
        category: detail.category,
        errorCode: detail.errorCode ?? '-',
        errorName: detail.errorName,
        errorMessage: detail.errorMessage,
        hint: detail.hint,
        retryable: detail.retryable,
      });
    } finally {
      this.client = undefined;
    }
  }

  private async ensureClient(): Promise<boolean> {
    if (this.client) {
      return true;
    }

    if (Date.now() < this.nextConnectRetryAt) {
      return false;
    }

    if (!this.connectPromise) {
      this.connectPromise = this.connectRedis();
    }

    try {
      await this.connectPromise;
      return Boolean(this.client);
    } catch (error) {
      this.nextConnectRetryAt = Date.now() + 5_000;
      const detail = describeRedisConnectionError(error);
      this.logErrorWithCooldown('redis rate limiter unavailable, fallback enabled', {
        ...this.redisConnectionMeta,
        category: detail.category,
        errorCode: detail.errorCode ?? '-',
        errorName: detail.errorName,
        errorMessage: detail.errorMessage,
        hint: detail.hint,
        retryable: detail.retryable,
        reconnectAfterMs: 5000,
        fallback: 'fail-open',
      });
      return false;
    } finally {
      this.connectPromise = undefined;
    }
  }

  private async connectRedis(): Promise<void> {
    const config = this.envService.getGatewayConfig();
    const { client } = createIoredisClient({
      url: config.rateLimitRedisUrl,
    });

    this.client = client;
    this.redisConnectionMeta = {
      redisUrl: config.rateLimitRedisUrl
        ? maskRedisUrl(config.rateLimitRedisUrl)
        : undefined,
    };
    await this.client.connect();
    this.nextConnectRetryAt = 0;

    if (!this.loggedConnect) {
      this.logger.debug(
        'gateway rate limit redis connected',
        {
          ...this.redisConnectionMeta,
          suppressRequestContext: true,
        },
        GatewayRateLimitService.name,
      );
      this.loggedConnect = true;
    }
  }

  private logErrorWithCooldown(
    message: string,
    meta: Record<string, unknown>,
  ): void {
    const key = `${message}:${String(meta.errorName ?? '-')}:${String(meta.errorCode ?? '-')}:${String(meta.category ?? '-')}`;
    const throttle = this.errorThrottle.hit(key);
    if (!throttle.shouldLog) {
      return;
    }

    this.logger.warn(
      message,
      {
        ...meta,
        ...(throttle.suppressedCount > 0 ? { suppressedCount: throttle.suppressedCount } : {}),
      },
      GatewayRateLimitService.name,
    );
  }
}
