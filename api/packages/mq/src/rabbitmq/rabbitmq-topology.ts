import {
  RABBITMQ_SHARED_VHOST,
  buildRabbitMqBusQueueArguments,
  IOT_BUS_DEAD_BIZ_ROUTING_KEY,
  IOT_BUS_DEAD_IOT_ROUTING_KEY,
  IOT_BUS_DOWNSTREAM_ROUTING_KEYS,
  IOT_BUS_UPSTREAM_ROUTING_KEYS,
  resolveRabbitMqTopologyCatalog,
  type RabbitMqExchangeType,
} from '@lumimax/config';

const UNIFIED_RABBITMQ_TOPOLOGY_PROFILE_NAME = 'lumimax';

type ExchangeType = RabbitMqExchangeType;

export interface RabbitMqTopologyQueueDefinition {
  name: string;
  durable?: boolean;
  arguments?: Record<string, unknown>;
}

export interface RabbitMqTopologyBindingDefinition {
  source: string;
  destination: string;
  destinationType: 'queue';
  routingKey: string;
}

export interface RabbitMqTopologyProfile {
  name: string;
  url?: string;
  fallbackVhost?: string;
  exchange: string;
  exchangeType: ExchangeType;
  queues: RabbitMqTopologyQueueDefinition[];
  bindings: RabbitMqTopologyBindingDefinition[];
  extraExchanges?: Array<{
    name: string;
    type: ExchangeType;
  }>;
}

export interface RabbitMqTopologyResourceStatus {
  name: string;
  ready: boolean;
}

export interface RabbitMqTopologyProfileStatus {
  exchange: RabbitMqTopologyResourceStatus;
  extraExchanges: RabbitMqTopologyResourceStatus[];
  name: string;
  queues: RabbitMqTopologyResourceStatus[];
  ready: boolean;
  vhost: string;
  warnings: string[];
}

export interface RabbitMqTopologyStatus {
  managementUrl: string;
  profiles: RabbitMqTopologyProfileStatus[];
  ready: boolean;
  warnings: string[];
}

type ResolvedRabbitMqTopologyProfile = RabbitMqTopologyProfile & { vhost: string };

interface RabbitMqTopologyClientOptions {
  authHeader: string;
  managementUrl: string;
}

interface QueueArgumentMismatch {
  actual: unknown;
  expected: unknown;
  key: string;
}

export async function ensureRabbitMqTopology(
  env: NodeJS.ProcessEnv = process.env,
): Promise<RabbitMqTopologyStatus> {
  const options = resolveTopologyOptions(env);
  const client = createTopologyClient(options.management);
  const statuses: RabbitMqTopologyProfileStatus[] = [];

  for (const profile of options.profiles) {
    await client.put(`/api/vhosts/${encodeURIComponent(profile.vhost)}`);
    await ensurePermissions(client, profile.vhost, options.management.username);
    await ensureExchange(client, profile.vhost, profile.exchange, profile.exchangeType);
    for (const exchange of profile.extraExchanges ?? []) {
      await ensureExchange(client, profile.vhost, exchange.name, exchange.type);
    }
    for (const queue of profile.queues) {
      await ensureQueue(client, profile.vhost, queue);
    }
    await removeLegacyBizQueueBridgeBindings(client, profile);
    for (const binding of profile.bindings) {
      await ensureBinding(client, profile.vhost, binding);
    }
    statuses.push(await inspectProfile(client, profile));
  }

  return summarizeStatus(options.management.managementUrl, statuses);
}

export async function inspectRabbitMqTopology(
  env: NodeJS.ProcessEnv = process.env,
): Promise<RabbitMqTopologyStatus> {
  const options = resolveTopologyOptions(env);
  const client = createTopologyClient(options.management);
  const statuses = await Promise.all(options.profiles.map((profile) => inspectProfile(client, profile)));
  return summarizeStatus(options.management.managementUrl, statuses);
}

export function resolveRabbitMqTopologyProfiles(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedRabbitMqTopologyProfile[] {
  const catalog = resolveRabbitMqTopologyCatalog(env);

  const exchange = catalog.broker.exchange;
  const exchangeType = catalog.broker.exchangeType;
  const vhost = catalog.broker.vhost;
  const bizQueue = catalog.queues.bizQueue;
  const iotQueue = catalog.queues.iotQueue;
  const iotDeadQueue = catalog.queues.iotDeadQueue;
  const bindQueue = (
    destination: string,
    routingKeys: readonly string[],
  ): RabbitMqTopologyBindingDefinition[] =>
    routingKeys.map((routingKey) => ({
      source: exchange,
      destination,
      destinationType: 'queue' as const,
      routingKey,
    }));
  const bizBindings = bindQueue(bizQueue, catalog.bizQueueRoutingKeys);
  const iotBindings = bindQueue(iotQueue, catalog.iotQueueRoutingKeys);
  const iotDeadBindings = bindQueue(iotDeadQueue, catalog.iotDeadQueueRoutingKeys);

  const durableQueue = (name: string, args?: Record<string, unknown>): RabbitMqTopologyQueueDefinition => ({
    name,
    durable: true,
    arguments: args,
  });

  const queues: RabbitMqTopologyQueueDefinition[] = [
    durableQueue(
      bizQueue,
      buildRabbitMqBusQueueArguments({
        ttlMs: catalog.iotMessageTtlMs,
        deadLetterExchange: exchange,
        deadLetterRoutingKey: IOT_BUS_DEAD_BIZ_ROUTING_KEY,
      }),
    ),
    durableQueue(
      iotQueue,
      buildRabbitMqBusQueueArguments({
        ttlMs: catalog.iotMessageTtlMs,
        deadLetterExchange: exchange,
        deadLetterRoutingKey: IOT_BUS_DEAD_IOT_ROUTING_KEY,
      }),
    ),
    durableQueue(iotDeadQueue),
  ];
  const bindings = dedupeBindingsByDestinationAndKey([
    ...bizBindings,
    ...iotBindings,
    ...iotDeadBindings,
  ]);

  return [
    {
      name: UNIFIED_RABBITMQ_TOPOLOGY_PROFILE_NAME,
      url: catalog.broker.urlIot ?? catalog.broker.urlApp,
      fallbackVhost: vhost,
      exchange,
      exchangeType,
      queues,
      bindings,
    },
  ].map((profile) => resolveProfile(profile));
}

function dedupeBindingsByDestinationAndKey(
  bindings: RabbitMqTopologyBindingDefinition[],
): RabbitMqTopologyBindingDefinition[] {
  const seen = new Set<string>();
  return bindings.filter((b) => {
    const key = `${b.destination}\0${b.routingKey}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function formatRabbitMqTopologySummary(
  status: RabbitMqTopologyStatus,
  username: string,
): string[] {
  return status.profiles.map((profile) =>
    `${profile.name}: amqp://${username}:***@${managementHost(status.managementUrl)}:5672/${encodeVhostForDisplay(profile.vhost)} exchange=${profile.exchange.name}`,
  );
}

function resolveTopologyOptions(env: NodeJS.ProcessEnv) {
  const managementUrl = normalizeBaseUrl(
    env.RABBITMQ_MANAGEMENT_URL ?? 'http://127.0.0.1:15672',
  );
  const username = env.RABBITMQ_USER ?? 'root';
  const password = env.RABBITMQ_PASSWORD ?? 'rd';

  return {
    management: {
      authHeader: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      managementUrl,
      username,
    },
    profiles: resolveRabbitMqTopologyProfiles(env),
  };
}

function resolveProfile(profile: RabbitMqTopologyProfile): ResolvedRabbitMqTopologyProfile {
  return {
    ...profile,
    vhost: profile.fallbackVhost ?? RABBITMQ_SHARED_VHOST,
  };
}

function createTopologyClient(options: RabbitMqTopologyClientOptions) {
  return {
    async getJson<T>(pathname: string): Promise<T | undefined> {
      const response = await fetch(`${options.managementUrl}${pathname}`, {
        method: 'GET',
        headers: {
          authorization: options.authHeader,
        },
      });

      if (response.status === 404) {
        return undefined;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `RabbitMQ management API request failed: GET ${pathname} -> ${response.status} ${errorText}`,
        );
      }

      return (await response.json()) as T;
    },

    async post(pathname: string, body?: unknown): Promise<void> {
      const response = await fetch(`${options.managementUrl}${pathname}`, {
        method: 'POST',
        headers: {
          authorization: options.authHeader,
          'content-type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (response.status === 201 || response.status === 204) {
        return;
      }

      if (response.status === 400) {
        const errorText = await response.text();
        if (/binding already exists/i.test(errorText)) {
          return;
        }
        throw new Error(
          `RabbitMQ management API request failed: POST ${pathname} -> ${response.status} ${errorText}`,
        );
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `RabbitMQ management API request failed: POST ${pathname} -> ${response.status} ${errorText}`,
        );
      }
    },

    async put(pathname: string, body?: unknown): Promise<void> {
      const response = await fetch(`${options.managementUrl}${pathname}`, {
        method: 'PUT',
        headers: {
          authorization: options.authHeader,
          'content-type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `RabbitMQ management API request failed: PUT ${pathname} -> ${response.status} ${errorText}`,
        );
      }
    },

    async delete(pathname: string): Promise<boolean> {
      const response = await fetch(`${options.managementUrl}${pathname}`, {
        method: 'DELETE',
        headers: {
          authorization: options.authHeader,
        },
      });

      if (response.status === 404) {
        return false;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `RabbitMQ management API request failed: DELETE ${pathname} -> ${response.status} ${errorText}`,
        );
      }

      return true;
    },
  };
}

interface RabbitMqQueueBinding {
  source: string;
  routing_key: string;
}

/** Removes bridge routing keys mistakenly bound to the biz consumer queue. */
async function removeLegacyBizQueueBridgeBindings(
  client: ReturnType<typeof createTopologyClient>,
  profile: ResolvedRabbitMqTopologyProfile,
): Promise<void> {
  const catalog = resolveRabbitMqTopologyCatalog(process.env);
  const bizQueue = catalog.queues.bizQueue;
  const bindings = await client.getJson<RabbitMqQueueBinding[]>(
    `/api/queues/${encodeURIComponent(profile.vhost)}/${encodeURIComponent(bizQueue)}/bindings`,
  );
  for (const binding of bindings ?? []) {
    if (binding.source !== profile.exchange) {
      continue;
    }
    if (!isObsoleteBizQueueBridgeRoutingKey(binding.routing_key)) {
      continue;
    }
    await client.delete(
      `/api/bindings/${encodeURIComponent(profile.vhost)}/e/${encodeURIComponent(profile.exchange)}/q/${encodeURIComponent(bizQueue)}/${encodeURIComponent(binding.routing_key)}`,
    );
  }
}

function isObsoleteBizQueueBridgeRoutingKey(routingKey: string): boolean {
  if (routingKey.startsWith('iot.up.') || routingKey.startsWith('iot.down.')) {
    return true;
  }
  return (
    IOT_BUS_UPSTREAM_ROUTING_KEYS as readonly string[]
  ).includes(routingKey)
    || (IOT_BUS_DOWNSTREAM_ROUTING_KEYS as readonly string[]).includes(routingKey);
}

/** Idempotent cleanup for dev/prod brokers after misconfigured Nest RMQ publisher bindings. */
export async function pruneBizQueueIotBridgeBindings(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const options = resolveTopologyOptions(env);
  const client = createTopologyClient(options.management);
  for (const profile of options.profiles) {
    await removeLegacyBizQueueBridgeBindings(client, profile);
  }
}

async function inspectProfile(
  client: ReturnType<typeof createTopologyClient>,
  profile: ResolvedRabbitMqTopologyProfile,
): Promise<RabbitMqTopologyProfileStatus> {
  const warnings: string[] = [];
  const exchange = await client.getJson(`/api/exchanges/${encodeURIComponent(profile.vhost)}/${encodeURIComponent(profile.exchange)}`);
  const extraExchanges = await Promise.all(
    (profile.extraExchanges ?? []).map(async (item) => ({
      name: item.name,
      ready: Boolean(
        await client.getJson(
          `/api/exchanges/${encodeURIComponent(profile.vhost)}/${encodeURIComponent(item.name)}`,
        ),
      ),
    })),
  );
  const queues = await Promise.all(
    profile.queues.map(async (queue) => {
      const resource = await client.getJson<Record<string, unknown>>(
        `/api/queues/${encodeURIComponent(profile.vhost)}/${encodeURIComponent(queue.name)}`,
      );
      const ready = Boolean(resource);
      const mismatch = resource
        ? findQueueArgumentMismatch(asRecord(resource.arguments), queue.arguments ?? {})
        : undefined;
      if (mismatch) {
        warnings.push(
          `queue ${queue.name} argument mismatch: ${mismatch.key} actual=${formatValue(mismatch.actual)} desired=${formatValue(mismatch.expected)}`,
        );
      }
      return {
        name: queue.name,
        ready: ready && !mismatch,
      };
    }),
  );

  return {
    exchange: {
      name: profile.exchange,
      ready: Boolean(exchange),
    },
    extraExchanges,
    name: profile.name,
    queues,
    ready:
      Boolean(exchange)
      && extraExchanges.every((item) => item.ready)
      && queues.every((item) => item.ready),
    vhost: profile.vhost,
    warnings,
  };
}

async function ensurePermissions(
  client: ReturnType<typeof createTopologyClient>,
  vhost: string,
  username: string,
): Promise<void> {
  await client.put(
    `/api/permissions/${encodeURIComponent(vhost)}/${encodeURIComponent(username)}`,
    {
      configure: '.*',
      write: '.*',
      read: '.*',
    },
  );
}

async function ensureExchange(
  client: ReturnType<typeof createTopologyClient>,
  vhost: string,
  exchange: string,
  type: ExchangeType,
): Promise<void> {
  await client.put(
    `/api/exchanges/${encodeURIComponent(vhost)}/${encodeURIComponent(exchange)}`,
    {
      type,
      durable: true,
      auto_delete: false,
      internal: false,
      arguments: {},
    },
  );
}

async function ensureQueue(
  client: ReturnType<typeof createTopologyClient>,
  vhost: string,
  queue: RabbitMqTopologyQueueDefinition,
): Promise<void> {
  const pathname = `/api/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(queue.name)}`;
  const existed = await client.getJson<Record<string, unknown>>(pathname);
  const desiredArguments = queue.arguments ?? {};

  if (existed) {
    const mismatch = findQueueArgumentMismatch(asRecord(existed.arguments), desiredArguments);
    if (mismatch) {
      return;
    }
  }

  await client.put(pathname, {
    durable: queue.durable ?? true,
    auto_delete: false,
    arguments: desiredArguments,
  });
}

async function ensureBinding(
  client: ReturnType<typeof createTopologyClient>,
  vhost: string,
  binding: RabbitMqTopologyBindingDefinition,
): Promise<void> {
  await client.post(
    `/api/bindings/${encodeURIComponent(vhost)}/e/${encodeURIComponent(binding.source)}/q/${encodeURIComponent(binding.destination)}`,
    {
      routing_key: binding.routingKey,
      arguments: {},
    },
  );
}

function summarizeStatus(
  managementUrl: string,
  profiles: RabbitMqTopologyProfileStatus[],
): RabbitMqTopologyStatus {
  const warnings = profiles.flatMap((profile) => profile.warnings);
  return {
    managementUrl,
    profiles,
    ready: profiles.every((profile) => profile.ready),
    warnings,
  };
}

function readNonEmptyString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/g, '');
}

function encodeVhostForDisplay(vhost: string): string {
  return vhost === '/' ? '%2F' : vhost;
}

function managementHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '127.0.0.1';
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return value as Record<string, unknown>;
}

function findQueueArgumentMismatch(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
): QueueArgumentMismatch | undefined {
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(actual[key]) !== JSON.stringify(value)) {
      return { key, actual: actual[key], expected: value };
    }
  }
  return undefined;
}

function formatValue(value: unknown): string {
  return value === undefined ? 'undefined' : JSON.stringify(value);
}
