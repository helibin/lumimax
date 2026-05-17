import type { INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { LoggerService, RequestContextService, ResponseLoggingInterceptor } from '@lumimax/logger';
import { Reflector } from '@nestjs/core';
import { AllExceptionFilter } from '../response/exception.filter';
import { ResponseInterceptor } from '../response/response.interceptor';
import { GlobalExceptionFilter } from './global-exception.filter';

const REQUEST_METHOD_MAP: Record<number, string> = {
  0: 'GET',
  1: 'POST',
  2: 'PUT',
  3: 'DELETE',
  4: 'PATCH',
  5: 'ALL',
  6: 'OPTIONS',
  7: 'HEAD',
};

export interface BootstrapLogOptions {
  serviceName: string;
  env: string;
  httpPort?: number;
  grpc?: string | false;
  rmq?: string | Record<string, unknown> | false;
  iot?: string | Record<string, unknown> | false;
  redis?: string | Record<string, unknown> | false;
  database?: string | false;
  swaggerUrl?: string | false;
  healthUrl?: string;
  routes?: RouteSummary | false;
}

export interface RouteSummary {
  modules: number;
  controllers: number;
  routes: number;
}

export interface GlobalLoggingOptions {
  enableApiResponse?: boolean;
}

export function enableGlobalLogging(
  app: INestApplication,
  serviceName: string,
  options: GlobalLoggingOptions = {},
): LoggerService {
  const logger = app.get(LoggerService);
  logger.setServiceName(serviceName);
  app.useLogger(logger);
  app.flushLogs();

  const enableApiResponse = options.enableApiResponse ?? true;
  const responseLogging = app.get(ResponseLoggingInterceptor);
  const requestContext = app.get(RequestContextService);
  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(
    responseLogging,
    ...(enableApiResponse ? [new ResponseInterceptor(reflector)] : []),
  );
  app.useGlobalFilters(
    enableApiResponse
      ? new AllExceptionFilter(logger, requestContext, reflector)
      : new GlobalExceptionFilter(logger, requestContext),
  );
  return logger;
}

export function logBootstrapSummary(
  logger: LoggerService,
  options: BootstrapLogOptions,
): void {
  logger.info(renderBootstrapSummary(options), 'Bootstrap');
}

export function logRoutes(
  app: INestApplication,
  _logger: LoggerService,
): RouteSummary {
  const modules: Map<
    unknown,
    { controllers: Map<unknown, { instance?: unknown; metatype?: unknown }> }
  > =
    (
      app as unknown as {
        container?: {
          getModules?: () => Map<
            unknown,
            {
              controllers: Map<
                unknown,
                { instance?: unknown; metatype?: unknown }
              >;
            }
          >;
        };
      }
    ).container?.getModules?.() ?? new Map();
  const deduped = new Set<string>();
  const routes: Array<{ method: string; path: string }> = [];
  let controllerCount = 0;

  for (const moduleRef of modules.values()) {
    for (const wrapper of moduleRef.controllers.values()) {
      const instance = wrapper.instance;
      const metatype = wrapper.metatype;
      if (!instance || !metatype) {
        continue;
      }
      controllerCount += 1;

      const controllerPath = normalizePath(
        Reflect.getMetadata(PATH_METADATA, metatype),
      );
      const prototype = Object.getPrototypeOf(instance) as Record<
        string,
        unknown
      >;
      const methodNames = Object.getOwnPropertyNames(prototype).filter(
        (name) =>
          name !== 'constructor' && typeof prototype[name] === 'function',
      );

      for (const methodName of methodNames) {
        const handler = prototype[methodName] as object;
        const routePathMetadata = Reflect.getMetadata(PATH_METADATA, handler);
        const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler);
        if (requestMethod === undefined || routePathMetadata === undefined) {
          continue;
        }
        const method =
          REQUEST_METHOD_MAP[requestMethod] ?? String(requestMethod);
        const routePath = normalizePath(routePathMetadata);
        const route = normalizeCombinedPath(controllerPath, routePath);
        const key = `${method} ${route}`;
        if (deduped.has(key)) {
          continue;
        }
        deduped.add(key);
        routes.push({ method, path: route });
      }
    }
  }

  return {
    modules: modules.size,
    controllers: controllerCount,
    routes: routes.length,
  };
}

function normalizePath(path: string | string[] | undefined): string {
  if (Array.isArray(path)) {
    return normalizePath(path[0]);
  }
  if (!path || path === '/') {
    return '';
  }
  const value = path.startsWith('/') ? path : `/${path}`;
  return value.replace(/\/+$/, '');
}

function normalizeCombinedPath(
  controllerPath: string,
  routePath: string,
): string {
  const combined = `${controllerPath}${routePath}`.replace(/\/+/g, '/');
  return combined.length === 0 ? '/' : combined;
}

function renderBootstrapSummary(options: BootstrapLogOptions): string {
  const showSwagger = options.serviceName.includes('gateway');
  const showIot = options.serviceName.includes('iot');
  const lines = [
    `[${options.serviceName}] 启动摘要`,
    formatSummaryLine('运行环境', formatEnv(options.env)),
    formatSummaryLine('HTTP 服务', formatHttpStatus(options.httpPort)),
    formatSummaryLine('gRPC 服务', formatGrpcStatus(options.grpc)),
    formatSummaryLine('路由状态', formatRouteSummary(options.routes)),
    formatSummaryLine('健康检查', formatEndpointStatus(options.healthUrl)),
    formatSummaryLine('消息队列(RMQ)', formatRabbitMqStatus(options.rmq)),
  ];
  if (showSwagger) {
    lines.push(
      formatSummaryLine('Swagger 文档', formatSwaggerStatus(options.swaggerUrl)),
    );
  }
  lines.push(
    formatSummaryLine(
      '数据库(Postgres)',
      formatDependencyStatus(options.database, 'configured', '已完成配置', '未配置'),
    ),
    formatSummaryLine(
      '缓存(Redis)',
      formatNamedDependency(options.redis, '已连接', '已配置', '已禁用'),
    ),
  );
  if (showIot) {
    lines.push(
      formatSummaryLine('IoT队列', formatIotQueueStatus(options.iot)),
    );
  }
  return lines.join('\n');
}

function formatSummaryLine(label: string, value: string): string {
  return `${padDisplayEnd(label, 18)}: ${value}`;
}

function padDisplayEnd(value: string, targetWidth: number): string {
  const width = getDisplayWidth(value);
  if (width >= targetWidth) {
    return value;
  }
  return `${value}${' '.repeat(targetWidth - width)}`;
}

function getDisplayWidth(value: string): number {
  let width = 0;
  for (const char of value) {
    width += isWideChar(char) ? 2 : 1;
  }
  return width;
}

function isWideChar(char: string): boolean {
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) {
    return false;
  }
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f)
    || (codePoint >= 0x2329 && codePoint <= 0x232a)
    || (codePoint >= 0x2e80 && codePoint <= 0xa4cf)
    || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0xfe10 && codePoint <= 0xfe19)
    || (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
    || (codePoint >= 0xff00 && codePoint <= 0xff60)
    || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  );
}

function formatEnv(env: string): string {
  switch (env) {
    case 'development':
      return '开发模式 (development)';
    case 'production':
      return '生产模式 (production)';
    case 'test':
      return '测试模式 (test)';
    default:
      return `${env} (${env})`;
  }
}

function formatHttpStatus(httpPort?: number): string {
  return httpPort !== undefined
    ? `已启动，访问地址为 http://localhost:${httpPort}`
    : '已禁用';
}

function formatGrpcStatus(grpc: string | false | undefined): string {
  if (!grpc) {
    return '已禁用';
  }
  const exposure = grpc.startsWith('0.0.0.0:') ? ' (允许外部访问)' : '';
  return `已启动，监听地址为 ${grpc}${exposure}`;
}

function formatEndpointStatus(url?: string): string {
  return url ? `可通过 ${url} 访问` : '已禁用';
}

function formatSwaggerStatus(url: string | false | undefined): string {
  return url ? `可通过 ${url} 访问` : '已禁用';
}

function formatDependencyStatus(
  value: string | false | undefined,
  configuredToken: string,
  configuredLabel: string,
  disabledLabel: string,
): string {
  if (!value) {
    return disabledLabel;
  }
  return value === configuredToken ? configuredLabel : value;
}

function formatNamedDependency(
  value: string | Record<string, unknown> | false | undefined,
  connectedLabel: string,
  configuredLabel: string,
  disabledLabel: string,
): string {
  if (!value) {
    return disabledLabel;
  }
  if (typeof value === 'string') {
    return value;
  }
  const status = value.status;
  if (status === 'connected') {
    return connectedLabel;
  }
  if (status === 'configured') {
    return configuredLabel;
  }
  return JSON.stringify(value);
}

function formatRabbitMqStatus(
  value: string | Record<string, unknown> | false | undefined,
): string {
  return formatNamedDependency(value, '已连接', '已配置', '已禁用');
}

function formatIotQueueStatus(
  value: string | Record<string, unknown> | false | undefined,
): string {
  return formatNamedDependency(value, '已连接', '已配置', '已禁用');
}

function formatRouteSummary(routes: RouteSummary | false | undefined): string {
  if (!routes) {
    return '未采集';
  }
  return `模块 ${routes.modules} / 控制器 ${routes.controllers} / 路由 ${routes.routes}`;
}
