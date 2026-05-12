import type { LoggerService as NestLoggerService } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { formatError } from './error-formatter';
import { formatPrettyLog } from './logger.formatter';
import { readLoggerRuntimeConfig, resolveLoggerServiceName } from './logger.config';
import { RequestContextService } from './request-context.service';
import { redactSensitive } from './logger.redactor';

export type LogMeta = Record<string, unknown>;

@Injectable()
export class AppLoggerService implements NestLoggerService {
  private serviceName = resolveLoggerServiceName();
  private readonly runtime = readLoggerRuntimeConfig();

  constructor(
    @Inject(PinoLogger) private readonly pinoLogger: PinoLogger,
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
  ) {}

  setServiceName(serviceName: string): void {
    this.serviceName = serviceName;
    this.pinoLogger.setContext(serviceName);
  }

  getServiceName(): string {
    return this.serviceName;
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    const { contextName, meta } = this.parseMetaOrContext(optionalParams);
    if (this.shouldSuppress(message, contextName)) {
      return;
    }
    this.write('info', this.stringifyMessage(message), meta, contextName);
  }

  info(message: unknown, metaOrContext?: LogMeta | string, context?: string): void {
    const { contextName, meta } = this.parseMetaOrContext([metaOrContext, context]);
    if (this.shouldSuppress(message, contextName)) {
      return;
    }
    this.write('info', this.stringifyMessage(message), meta, contextName);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    const { contextName, meta } = this.parseMetaOrContext(optionalParams);
    if (this.shouldSuppress(message, contextName)) {
      return;
    }
    this.write('warn', this.stringifyMessage(message), meta, contextName);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    const { contextName, meta } = this.parseMetaOrContext(optionalParams);
    if (this.shouldSuppress(message, contextName)) {
      return;
    }
    this.write('debug', this.stringifyMessage(message), meta, contextName);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    const { contextName, meta } = this.parseMetaOrContext(optionalParams);
    if (this.shouldSuppress(message, contextName)) {
      return;
    }
    this.write('debug', this.stringifyMessage(message), meta, contextName);
  }

  error(message: unknown, metaOrError?: LogMeta | Error | string, context?: string): void {
    const parsed = this.parseErrorArgs(metaOrError, context);
    if (this.shouldSuppress(message, parsed.contextName)) {
      return;
    }

    if (parsed.error) {
      const formatted = formatError(parsed.error, this.runtime.stackMaxLines);
      this.write(
        'error',
        this.stringifyMessage(message),
        {
          ...parsed.meta,
          errorType: formatted.errorType,
          rootCause: formatted.rootCause,
          shortMessage: formatted.shortMessage,
          ...(formatted.hint ? { hint: formatted.hint } : {}),
          ...(formatted.compactStack.length > 0 ? { stack: formatted.compactStack } : {}),
          ...(parsed.error instanceof Error && parsed.error.cause !== undefined
            ? { cause: summarizeCause(parsed.error.cause) }
            : {}),
        },
        parsed.contextName,
      );
      return;
    }

    this.write('error', this.stringifyMessage(message), parsed.meta, parsed.contextName);
  }

  private write(
    level: 'error' | 'warn' | 'info' | 'debug',
    message: string,
    meta: LogMeta,
    contextName?: string,
  ): void {
    const payload = this.buildPayload(meta);
    if (this.runtime.nodeEnv === 'production' || this.runtime.format === 'json') {
      this.pinoLogger.logger[level](
        {
          service: this.serviceName,
          requestId: payload.requestId,
          traceId: payload.traceId,
          context: contextName,
          meta: payload.meta,
        },
        message,
      );
      return;
    }

    this.pinoLogger.logger[level](
      formatPrettyLog({
        level,
        message,
        serviceName: this.serviceName,
        contextName,
        requestId: payload.requestId,
        traceId: payload.traceId,
        idLabel: meta.idLabel === 'ReqId' ? 'ReqId' : 'TraceId',
        meta: payload.meta,
      }),
    );
  }

  private buildPayload(meta: LogMeta): {
    requestId?: string;
    traceId?: string;
    meta: Record<string, unknown>;
  } {
    const sanitized = sanitizeMeta(meta);
    const output = { ...sanitized };
    const suppressRequestContext = output.suppressRequestContext === true;
    const explicitRequestId = pickToken(output.requestId);
    const explicitTraceId = pickToken(output.traceId);
    delete output.idLabel;
    delete output.suppressRequestContext;
    delete output.requestId;
    delete output.traceId;
    return {
      requestId:
        explicitRequestId
        ?? (suppressRequestContext ? undefined : this.requestContext.getRequestId()),
      traceId:
        explicitTraceId
        ?? (suppressRequestContext ? undefined : this.requestContext.getTraceId()),
      meta: output,
    };
  }

  private parseMetaOrContext(optionalParams: unknown[]): { contextName?: string; meta: LogMeta } {
    const compact = optionalParams.filter((item) => item !== undefined && item !== null);
    if (compact.length === 0) {
      return { contextName: undefined, meta: {} };
    }
    if (compact.length === 1) {
      const first = compact[0];
      if (typeof first === 'string') {
        return { contextName: first, meta: {} };
      }
      return { contextName: undefined, meta: isMeta(first) ? first : {} };
    }

    const [first, second] = compact;
    if (typeof first === 'string' && isMeta(second)) {
      return { contextName: first, meta: second };
    }
    if (isMeta(first) && typeof second === 'string') {
      return { contextName: second, meta: first };
    }
    return {
      contextName: typeof second === 'string' ? second : typeof first === 'string' ? first : undefined,
      meta: isMeta(first) ? first : isMeta(second) ? second : {},
    };
  }

  private parseErrorArgs(
    metaOrError?: LogMeta | Error | string,
    context?: string,
  ): { contextName?: string; meta: LogMeta; error?: unknown } {
    if (metaOrError instanceof Error) {
      return { contextName: context, meta: {}, error: metaOrError };
    }
    if (typeof metaOrError === 'string') {
      return { contextName: metaOrError, meta: {} };
    }
    if (isMeta(metaOrError)) {
      const embedded = extractError(metaOrError);
      const cleanMeta = { ...metaOrError };
      delete cleanMeta.error;
      delete cleanMeta.err;
      return {
        contextName: context,
        meta: cleanMeta,
        error: embedded,
      };
    }
    return { contextName: context, meta: {} };
  }

  private stringifyMessage(message: unknown): string {
    if (typeof message === 'string') {
      return message;
    }
    if (message instanceof Error) {
      return message.message;
    }
    try {
      return JSON.stringify(redactSensitive(message));
    } catch {
      return String(message);
    }
  }

  private shouldSuppress(message: unknown, context?: string): boolean {
    if (!context) {
      return false;
    }
    const text = this.stringifyMessage(message);
    if (context === 'RouterExplorer' && /^Mapped\s+\{.+\}\s+route$/.test(text)) {
      return true;
    }
    if (context === 'RoutesResolver') {
      return true;
    }
    if (context === 'InstanceLoader' && /dependencies initialized/.test(text)) {
      return true;
    }
    if (context === 'NestFactory' && /Starting Nest application/.test(text)) {
      return true;
    }
    if (context === 'NestApplication' && /Nest application successfully started/.test(text)) {
      return true;
    }
    if (context === 'NestMicroservice' && /Nest microservice successfully started/.test(text)) {
      return true;
    }
    if (context === 'ClientProxy' && /Successfully connected to RMQ broker/.test(text)) {
      return true;
    }
    if (context === 'TypeORM' && /TypeORM datasource configured/.test(text)) {
      return true;
    }
    return false;
  }
}

function sanitizeMeta(meta: LogMeta): LogMeta {
  const redacted = redactSensitive(meta);
  return isMeta(redacted) ? redacted : {};
}

function isMeta(value: unknown): value is LogMeta {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractError(meta: LogMeta): unknown {
  if (meta.error instanceof Error) {
    return meta.error;
  }
  if (meta.err instanceof Error) {
    return meta.err;
  }
  return undefined;
}

function summarizeCause(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      cause: error.cause ? summarizeCause(error.cause) : undefined,
    };
  }
  return redactSensitive(error);
}

function pickToken(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export { AppLoggerService as AppLogger };
