import { getEnvString } from '@lumimax/config';
import Redis, { Cluster, type RedisOptions } from 'ioredis';

export type RedisMode = 'auto' | 'single' | 'cluster';
export type RedisRuntimeMode = 'single' | 'cluster';
export type IORedisClient = Redis | Cluster;

export interface RedisNode {
  host: string;
  port: number;
}

export interface RedisConnectionOptions {
  mode?: RedisMode;
  url?: string;
  nodes?: string[];
  username?: string;
  password?: string;
  db?: string | number;
  defaultHost?: string;
  defaultPort?: number;
}

export interface IORedisClientBundle {
  client: IORedisClient;
  mode: RedisRuntimeMode;
  nodes: RedisNode[];
}

export interface RedisConnectionErrorInfo {
  errorName: string;
  errorCode?: string;
  errorMessage: string;
  category:
    | 'auth_required'
    | 'auth_failed'
    | 'connection_refused'
    | 'dns_not_found'
    | 'timeout'
    | 'readonly_replica'
    | 'tls_error'
    | 'unknown';
  hint: string;
  retryable: boolean;
}

export function buildRedisUrlFromEnv(
  env?: Record<string, string | undefined>,
): string {
  const targetEnv = env ?? {
    REDIS_URL: getEnvString('REDIS_URL'),
    REDIS_USERNAME: getEnvString('REDIS_USERNAME'),
    REDIS_PASSWORD: getEnvString('REDIS_PASSWORD'),
    REDIS_DB: getEnvString('REDIS_DB'),
    REDIS_HOST: getEnvString('REDIS_HOST'),
    REDIS_PORT: getEnvString('REDIS_PORT'),
  };
  const redisUrl = targetEnv.REDIS_URL?.trim();
  if (redisUrl) {
    try {
      const parsed = new URL(redisUrl);
      const username = targetEnv.REDIS_USERNAME?.trim();
      const password = targetEnv.REDIS_PASSWORD?.trim();
      const db = targetEnv.REDIS_DB?.trim();

      if (!parsed.username && username) {
        parsed.username = username;
      }
      if (!parsed.password && password) {
        parsed.password = password;
      }
      if ((!parsed.pathname || parsed.pathname === '/') && db) {
        parsed.pathname = `/${db}`;
      }

      return parsed.toString();
    } catch {
      return redisUrl;
    }
  }

  const host = targetEnv.REDIS_HOST?.trim();
  const port = targetEnv.REDIS_PORT?.trim();
  if (!host || !port) {
    return '';
  }

  const username = targetEnv.REDIS_USERNAME?.trim();
  const password = targetEnv.REDIS_PASSWORD?.trim();
  const db = targetEnv.REDIS_DB?.trim();
  const credentials = resolveRedisCredentials(username, password);
  const dbPath = db ? `/${db}` : '';
  return `redis://${credentials}${host}:${port}${dbPath}`;
}

export function maskRedisUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function describeRedisConnectionError(
  error: unknown,
): RedisConnectionErrorInfo {
  const normalizedError = normalizeError(error);
  const message = normalizedError.errorMessage.toUpperCase();
  const code = normalizedError.errorCode?.toUpperCase();

  if (message.includes('NOAUTH')) {
    return {
      ...normalizedError,
      category: 'auth_required',
      hint:
        'Redis requires authentication. Check REDIS_URL/REDIS_PASSWORD and ensure password is included in the connection string.',
      retryable: false,
    };
  }

  if (message.includes('WRONGPASS')) {
    return {
      ...normalizedError,
      category: 'auth_failed',
      hint:
        'Redis password is invalid. Verify REDIS_URL credentials and server requirepass/user ACL settings.',
      retryable: false,
    };
  }

  if (code === 'ECONNREFUSED' || message.includes('ECONNREFUSED')) {
    return {
      ...normalizedError,
      category: 'connection_refused',
      hint:
        'Redis is unreachable on target host/port. Check service status, docker port mapping, and firewall/network policy.',
      retryable: true,
    };
  }

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || message.includes('ENOTFOUND')) {
    return {
      ...normalizedError,
      category: 'dns_not_found',
      hint:
        'Redis hostname cannot be resolved. Check REDIS host value and DNS/network configuration.',
      retryable: true,
    };
  }

  if (code === 'ETIMEDOUT' || message.includes('TIMED OUT') || message.includes('TIMEOUT')) {
    return {
      ...normalizedError,
      category: 'timeout',
      hint:
        'Redis connection timed out. Check network latency, security groups, and whether Redis is overloaded.',
      retryable: true,
    };
  }

  if (message.includes('READONLY')) {
    return {
      ...normalizedError,
      category: 'readonly_replica',
      hint:
        'Connected to a read-only Redis node. Verify primary endpoint or cluster routing for write commands.',
      retryable: true,
    };
  }

  if (
    message.includes('TLS')
    || message.includes('CERT')
    || message.includes('SSL')
  ) {
    return {
      ...normalizedError,
      category: 'tls_error',
      hint:
        'Redis TLS handshake/certificate failed. Verify rediss:// usage and certificate trust settings.',
      retryable: false,
    };
  }

  return {
    ...normalizedError,
    category: 'unknown',
    hint:
      'Check Redis endpoint, credentials, and network connectivity. Review previous logs for first failure details.',
    retryable: true,
  };
}

export function parseRedisNodes(
  rawNodes: string[] = [],
  redisUrl?: string,
  fallback: RedisNode = { host: '127.0.0.1', port: 6379 },
): RedisNode[] {
  const parsed = rawNodes
    .map((node) => parseRedisNode(node))
    .filter((node): node is RedisNode => Boolean(node));

  if (parsed.length > 0) {
    return parsed;
  }

  if (redisUrl?.trim()) {
    const fromUrl = parseRedisNode(redisUrl);
    if (fromUrl) {
      return [fromUrl];
    }
  }

  return [fallback];
}

export function resolveRedisMode(
  mode: RedisMode = 'auto',
  nodeCount: number,
): RedisRuntimeMode {
  if (mode === 'single' || mode === 'cluster') {
    return mode;
  }
  return nodeCount > 1 ? 'cluster' : 'single';
}

export function createIoredisClient(
  options: RedisConnectionOptions,
): IORedisClientBundle {
  const redisUrl = options.url?.trim() || undefined;
  const nodes = parseRedisNodes(
    options.nodes ?? [],
    redisUrl,
    {
      host: options.defaultHost ?? '127.0.0.1',
      port: options.defaultPort ?? 6379,
    },
  );
  const mode = resolveRedisMode(options.mode ?? 'auto', nodes.length);
  const redisOptions = buildIoredisOptions(redisUrl, {
    username: options.username,
    password: options.password,
    db: options.db,
  });

  if (mode === 'cluster') {
    return {
      mode,
      nodes,
      client: new Cluster(nodes, { redisOptions }),
    };
  }

  if (redisUrl) {
    return {
      mode,
      nodes,
      client: new Redis(redisUrl, redisOptions),
    };
  }

  return {
    mode,
    nodes,
    client: new Redis({
      ...redisOptions,
      host: nodes[0].host,
      port: nodes[0].port,
    }),
  };
}

export async function closeIoredisClient(client?: IORedisClient): Promise<void> {
  if (!client) {
    return;
  }
  await client.quit();
}

function buildIoredisOptions(
  redisUrl: string | undefined,
  overrides: { username?: string; password?: string; db?: string | number },
): RedisOptions {
  const options: RedisOptions = {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    reconnectOnError: () => true,
  };

  if (redisUrl) {
    try {
      const parsed = new URL(redisUrl);
      if (parsed.protocol === 'rediss:') {
        options.tls = {};
      }
      if (parsed.username) {
        options.username = decodeURIComponent(parsed.username);
      }
      if (parsed.password) {
        options.password = decodeURIComponent(parsed.password);
      }
      if (parsed.pathname && parsed.pathname !== '/') {
        const db = Number(parsed.pathname.replace('/', ''));
        if (Number.isFinite(db) && db >= 0) {
          options.db = db;
        }
      }
    } catch {
      // Ignore invalid URL and fallback to default options.
    }
  }

  if (overrides.username) {
    options.username = overrides.username;
  }
  if (overrides.password) {
    options.password = overrides.password;
  }
  if (overrides.db !== undefined && overrides.db !== null && overrides.db !== '') {
    const db = Number(overrides.db);
    if (Number.isFinite(db) && db >= 0) {
      options.db = db;
    }
  }

  return options;
}

function parseRedisNode(value: string): RedisNode | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = trimmed.includes('://') ? new URL(trimmed) : new URL(`redis://${trimmed}`);
    const host = url.hostname?.trim();
    const port = Number(url.port || 6379);
    if (!host || !Number.isFinite(port) || port <= 0) {
      return null;
    }
    return { host, port };
  } catch {
    return null;
  }
}

function resolveRedisCredentials(
  username?: string,
  password?: string,
): string {
  const encodedUser = username ? encodeURIComponent(username) : '';
  const encodedPassword = password ? encodeURIComponent(password) : '';
  if (!encodedUser && !encodedPassword) {
    return '';
  }
  if (!encodedUser) {
    return `:${encodedPassword}@`;
  }
  return `${encodedUser}:${encodedPassword}@`;
}

function normalizeError(error: unknown): {
  errorName: string;
  errorCode?: string;
  errorMessage: string;
} {
  if (error instanceof Error) {
    const code = 'code' in error && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : undefined;
    return {
      errorName: error.name || 'Error',
      errorCode: code,
      errorMessage: error.message || String(error),
    };
  }
  return {
    errorName: 'UnknownError',
    errorMessage: String(error),
  };
}
