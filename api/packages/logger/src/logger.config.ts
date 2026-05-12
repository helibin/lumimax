import path from 'node:path';
import fs from 'node:fs';
import { getEnvString } from '@lumimax/config';
import type { Params } from 'nestjs-pino';
import type { TransportMultiOptions, TransportTargetOptions } from 'pino';
import type { LoggerLevel, LoggerRuntimeConfig } from './logger.constants';

export function createLoggerModuleConfig(): Params {
  const runtime = readLoggerRuntimeConfig();
  return {
    pinoHttp: {
      level: runtime.level,
      formatters: {
        bindings(bindings: Record<string, unknown>) {
          const next = { ...bindings };
          delete next.pid;
          delete next.hostname;
          delete next.reqId;
          return next;
        },
        ...(runtime.nodeEnv === 'production'
          ? {
              level(label: string) {
                return { level: label };
              },
            }
          : {}),
      },
      base: runtime.nodeEnv === 'production'
        ? { service: runtime.serviceName }
        : undefined,
      autoLogging: false,
      quietReqLogger: true,
      quietResLogger: true,
      timestamp: runtime.nodeEnv === 'production',
      transport: buildTransport(runtime),
      serializers: {
        req: () => undefined,
        res: () => undefined,
        err: () => undefined,
      },
    },
  };
}

export function readLoggerRuntimeConfig(): LoggerRuntimeConfig {
  const nodeEnv = getEnvString('NODE_ENV', 'development')?.trim() || 'development';
  return {
    serviceName: resolveLoggerServiceName(),
    nodeEnv,
    level: resolveLogLevel(getEnvString('LOG_LEVEL')),
    logToConsole: readBoolean(getEnvString('LOG_TO_CONSOLE'), true),
    logToFile: readBoolean(getEnvString('LOG_TO_FILE'), nodeEnv === 'development'),
    logDir: resolveLogDir(getEnvString('LOG_DIR')),
    headerEnabled: readBoolean(getEnvString('LOG_HEADER_ENABLED'), false),
    bodyEnabled: readBoolean(getEnvString('LOG_BODY_ENABLED'), nodeEnv === 'development'),
    bodyMaxLength: readNumber(getEnvString('LOG_BODY_MAX_LENGTH'), 5000, 128, 100_000),
    maxFiles: getEnvString('LOG_MAX_FILES')?.trim() || '14d',
    format: getEnvString('LOG_FORMAT')?.trim() === 'json' ? 'json' : 'pretty',
    suppressHealthcheck: readBoolean(getEnvString('LOG_SUPPRESS_HEALTHCHECK'), true),
    stackMaxLines: readNumber(getEnvString('LOG_STACK_MAX_LINES'), 8, 2, 50),
    thirdPartyErrorThrottleMs: readNumber(
      getEnvString('LOG_THIRD_PARTY_ERROR_THROTTLE_MS'),
      10_000,
      1000,
      300_000,
    ),
  };
}

export function resolveLoggerServiceName(): string {
  const envName = getEnvString('SERVICE_NAME')?.trim();
  if (envName) {
    return envName;
  }
  const packageName = getEnvString('npm_package_name')?.trim();
  if (packageName) {
    return packageName.replace(/^@[^/]+\//, '');
  }
  return path.basename(process.cwd()) || 'app';
}

export function resolveWorkspaceRoot(): string {
  let current = process.cwd();
  for (;;) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return process.cwd();
    }
    current = parent;
  }
}

function buildTransport(runtime: LoggerRuntimeConfig): TransportMultiOptions | undefined {
  if (runtime.nodeEnv === 'production' || runtime.format === 'json') {
    return undefined;
  }

  const targets: TransportTargetOptions[] = [];
  if (runtime.logToConsole) {
    targets.push({
      target: 'pino-pretty',
      level: runtime.level,
      options: {
        colorize: false,
        singleLine: false,
        translateTime: false,
        ignore: 'pid,hostname,reqId,requestId,traceId,level,time',
        messageFormat: '{msg}',
      },
    });
  }

  if (runtime.logToFile) {
    ensureDirectory(runtime.logDir);
    const logFileName = `${sanitizeLogFileStem(runtime.serviceName)}.log`;
    targets.push({
      target: 'pino-roll',
      level: runtime.level,
      options: {
        file: path.join(runtime.logDir, logFileName),
        frequency: 'daily',
        mkdir: true,
        size: '10m',
      },
    });
  }

  return targets.length > 0 ? { targets } : undefined;
}

function ensureDirectory(target: string): void {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
}

function resolveLogDir(logDir?: string): string {
  const raw = logDir?.trim();
  if (!raw) {
    return path.join(resolveWorkspaceRoot(), 'logs');
  }
  return path.isAbsolute(raw) ? raw : path.join(resolveWorkspaceRoot(), raw);
}

function resolveLogLevel(value: string | undefined): LoggerLevel {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'error' || normalized === 'warn' || normalized === 'info' || normalized === 'debug') {
    return normalized;
  }
  return 'debug';
}

function sanitizeLogFileStem(value: string): string {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'app';
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function readNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}
