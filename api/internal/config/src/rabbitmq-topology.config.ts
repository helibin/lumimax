export type RabbitMqExchangeType =
  | 'direct'
  | 'fanout'
  | 'topic'
  | 'headers'
  | (string & {});

export const RABBITMQ_SHARED_VHOST = '/';

/** Log / doc labels only (single broker profile in topology). */
export const RABBITMQ_APP_PROFILE_NAME = 'lumimax.default';
export const RABBITMQ_IOT_PROFILE_NAME = 'lumimax.bus';

export const RABBITMQ_DEFAULT_URL = 'amqp://guest:guest@localhost:5672';
/** Single topic exchange name for app + IoT on the default RabbitMQ vhost: `lumimax.bus`. */
export const RABBITMQ_DEFAULT_EVENTS_EXCHANGE = 'lumimax.bus';
export const RABBITMQ_DEFAULT_EVENTS_EXCHANGE_TYPE: RabbitMqExchangeType = 'topic';
export const RABBITMQ_DEFAULT_QUEUE = 'lumimax.q.biz.events';

/** Shared dead-letter queue for app + IoT bus messages. */
export const RABBITMQ_DEFAULT_DLX_QUEUE = 'lumimax.q.dead';

export const IOT_RABBITMQ_DEFAULT_QUEUE = 'lumimax.q.iot.stream';

export const IOT_BRIDGE_DEFAULT_PREFETCH = 20;
export const IOT_BUS_UPSTREAM_ROUTING_KEYS = ['iot.up.#'] as const;
export const IOT_BUS_DOWNSTREAM_ROUTING_KEYS = ['iot.down.#'] as const;
export const IOT_BUS_BIZ_ROUTING_KEYS = ['biz.#'] as const;
export const IOT_BUS_DEAD_ROUTING_KEYS = ['dead.#'] as const;
export const IOT_BUS_DEAD_BIZ_ROUTING_KEY = 'dead.biz';
export const IOT_BUS_DEAD_IOT_ROUTING_KEY = 'dead.iot';

/**
 * Queue arguments so expired / rejected / nacked messages are routed to `dlxQueue`
 * via the **default exchange** (empty `x-dead-letter-exchange`, routing key = queue name).
 */
export function buildRabbitMqMainQueueDeadLetterArguments(
  dlxQueue: string,
): Record<string, unknown> {
  return {
    'x-dead-letter-exchange': '',
    'x-dead-letter-routing-key': dlxQueue,
  };
}

export function buildRabbitMqBusQueueArguments(input: {
  ttlMs?: number;
  deadLetterExchange: string;
  deadLetterRoutingKey: string;
}): Record<string, unknown> {
  return {
    ...(typeof input.ttlMs === 'number' ? { 'x-message-ttl': input.ttlMs } : {}),
    'x-dead-letter-exchange': input.deadLetterExchange,
    'x-dead-letter-routing-key': input.deadLetterRoutingKey,
  };
}

export interface RabbitMqBrokerTopology {
  vhost: string;
  exchange: string;
  exchangeType: RabbitMqExchangeType;
  /** Normalized `RABBITMQ_URL`. */
  urlApp?: string;
  /** Effective AMQP URL for IoT (same as `urlApp`, derived from `RABBITMQ_URL`). */
  urlIot?: string;
}

export interface RabbitMqQueuesTopology {
  /** Business event queue (`RABBITMQ_QUEUE` → `RABBITMQ_DEFAULT_QUEUE`). */
  bizQueue: string;
  /** iot-service stream queue (`iot.up.#` + `iot.down.#`). */
  iotQueue: string;
  /** Shared dead-letter queue (`RABBITMQ_DLX_QUEUE`). */
  iotDeadQueue: string;
}

export interface RabbitMqTopologyCatalog {
  /** One exchange + one vhost for app and IoT. */
  broker: RabbitMqBrokerTopology;
  /** Named queues on that broker. */
  queues: RabbitMqQueuesTopology;
  iotQueueRoutingKeys: readonly string[];
  bizQueueRoutingKeys: readonly string[];
  iotDeadQueueRoutingKeys: readonly string[];
  iotMessageTtlMs?: number;
}

export function resolveRabbitMqTopologyCatalog(
  env: NodeJS.ProcessEnv = process.env,
): RabbitMqTopologyCatalog {
  const configuredVhost = normalizeConfiguredVhost(env.RABBITMQ_VHOST);
  const sharedVhost = configuredVhost ?? RABBITMQ_SHARED_VHOST;
  const urlApp = normalizeLocalhostAmqpUrl(readNonEmptyString(env.RABBITMQ_URL));
  const urlIot = urlApp;

  const vhostApp = resolveVhost(urlApp, sharedVhost);
  const vhostIot = resolveVhost(
    urlIot,
    normalizeConfiguredVhost(env.RABBITMQ_IOT_VHOST) ?? sharedVhost,
  );

  const explicitEventsExchangeApp = readNonEmptyString(env.RABBITMQ_EVENTS_EXCHANGE);
  const eventsExchange = explicitEventsExchangeApp ?? RABBITMQ_DEFAULT_EVENTS_EXCHANGE;

  const explicitEventsTypeApp = readNonEmptyString(env.RABBITMQ_EVENTS_EXCHANGE_TYPE) as
    | RabbitMqExchangeType
    | undefined;
  const eventsExchangeType = explicitEventsTypeApp ?? RABBITMQ_DEFAULT_EVENTS_EXCHANGE_TYPE;

  const bizQueue = readNonEmptyString(env.RABBITMQ_QUEUE) ?? RABBITMQ_DEFAULT_QUEUE;
  const iotQueue =
    readNonEmptyString(env.IOT_RABBITMQ_QUEUE)
    ?? IOT_RABBITMQ_DEFAULT_QUEUE;
  const iotDeadQueue =
    readNonEmptyString(env.RABBITMQ_DLX_QUEUE)
    ?? RABBITMQ_DEFAULT_DLX_QUEUE;
  const iotMessageTtlMs = readPositiveInteger(env.IOT_RABBITMQ_MESSAGE_TTL_MS);

  if (bizQueue === iotDeadQueue) {
    throw new Error(
      `RabbitMQ unified topology requires distinct main and dead queues (biz=${bizQueue}, dead=${iotDeadQueue}).`,
    );
  }

  assertUnifiedRabbitMqBrokerVhost({ vhostApp, vhostIot });
  const iotQueueRoutingKeys = [
    ...IOT_BUS_UPSTREAM_ROUTING_KEYS,
    ...IOT_BUS_DOWNSTREAM_ROUTING_KEYS,
  ] as const;
  /** biz queue only receives normalized business events (`biz.#`). */
  const bizQueueRoutingKeys = [...IOT_BUS_BIZ_ROUTING_KEYS] as const;
  const iotDeadQueueRoutingKeys = [...IOT_BUS_DEAD_ROUTING_KEYS] as const;

  return {
    broker: {
      vhost: vhostApp,
      exchange: eventsExchange,
      exchangeType: eventsExchangeType,
      urlApp,
      urlIot,
    },
    queues: {
      bizQueue,
      iotQueue,
      iotDeadQueue,
    },
    iotQueueRoutingKeys,
    bizQueueRoutingKeys,
    iotDeadQueueRoutingKeys,
    iotMessageTtlMs,
  };
}

function assertUnifiedRabbitMqBrokerVhost(params: { vhostApp: string; vhostIot: string }): void {
  if (params.vhostApp !== params.vhostIot) {
    throw new Error(
      `RabbitMQ unified topology requires the same vhost for app and IoT AMQP URLs (got app vhost=${params.vhostApp}, iot vhost=${params.vhostIot}). Use the same broker vhost (default ${RABBITMQ_SHARED_VHOST}).`,
    );
  }
}

export function normalizeLocalhostAmqpUrl(url?: string): string | undefined {
  const value = url?.trim();
  if (!value) {
    return undefined;
  }
  try {
    const parsed = new URL(value);
    if ((parsed.protocol === 'amqp:' || parsed.protocol === 'amqps:') && parsed.pathname === '/') {
      parsed.pathname = '';
    }
    if (parsed.hostname === 'localhost') {
      parsed.hostname = '127.0.0.1';
    }
    return parsed.toString();
  } catch {
    return value;
  }
}

function resolveVhost(url: string | undefined, fallbackVhost: string | undefined): string {
  const fromUrl = parseVhostFromAmqpUrl(url);
  if (fromUrl) {
    return fromUrl;
  }
  return fallbackVhost ?? RABBITMQ_SHARED_VHOST;
}

function parseVhostFromAmqpUrl(url: string | undefined): string | undefined {
  const value = readNonEmptyString(url);
  if (!value) {
    return undefined;
  }

  try {
    const parsed = new URL(value);
    const rawPath = parsed.pathname || '';
    /** AMQP URI: default vhost is encoded as `/%2F` in the path. */
    if (rawPath === '/%2F' || rawPath === '/%2f') {
      return '/';
    }
    const pathname = decodeURIComponent(rawPath);
    /** Path `/` or empty means no vhost segment; use the configured fallback vhost. */
    if (!pathname || pathname === '/') {
      return undefined;
    }
    const stripped = pathname.replace(/^\/+/, '');
    return stripped || undefined;
  } catch {
    return undefined;
  }
}

function normalizeConfiguredVhost(value: string | undefined): string | undefined {
  const trimmed = readNonEmptyString(value);
  if (!trimmed) {
    return undefined;
  }
  return trimmed === '/' ? '/' : trimmed.replace(/^\/+/, '');
}

function readNonEmptyString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readPositiveInteger(value: string | undefined, fallback?: number): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}
