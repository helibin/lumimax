import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import {
  localizeErrorMessageByCode,
  mapExceptionToBusinessError,
  resolveLocaleFromRequest,
} from '@lumimax/contracts';
import type { AppLogger, RequestContextService } from '@lumimax/logger';
import { createErrorResponse, getOrCreateRequestId } from './response.factory';

@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly logger: AppLogger,
    private readonly requestContext?: RequestContextService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType<'http' | 'rpc' | 'ws'>() !== 'http') {
      return;
    }

    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Record<string, unknown>>();
    const res = ctx.getResponse<{ status(code: number): { json(payload: unknown): void }; setHeader?(name: string, value: string): void }>();
    const requestId = getOrCreateRequestId(req);
    const durationSeconds = resolveDurationSeconds(this.requestContext?.getStartTime());
    const status = resolveStatus(exception);
    const businessError = mapExceptionToBusinessError(exception);
    const locale = resolveLocaleFromRequest(req);
    const localizedMessage = localizeErrorMessageByCode(businessError.code, locale);
    const errorDetails = extractExceptionDetails(exception);
    const rawMessage = errorDetails.message;
    const responseDetails = normalizeResponseDetails(
      exception,
      errorDetails.responseDetails,
      localizedMessage,
    );
    const payload = createErrorResponse(
      businessError.code,
      localizedMessage,
      requestId,
      status,
      {
        details: responseDetails,
        key: businessError.key,
        locale,
        rawMessage,
      },
    );

    if (typeof res.setHeader === 'function') {
      res.setHeader('x-request-id', requestId);
    }

    this.logger.error(
      `请求失败，耗时(s): ${durationSeconds.toFixed(3)}`,
      {
        idLabel: 'ReqId',
        method: typeof req.method === 'string' ? req.method : '-',
        url: typeof req.originalUrl === 'string'
          ? req.originalUrl
          : typeof req.url === 'string'
            ? req.url
            : '/',
        durationSeconds,
        status,
        code: businessError.key,
        message: localizedMessage,
        rawMessage,
        rootCause: errorDetails.rootCause,
        stack: errorDetails.stack,
        upstream: errorDetails.upstream,
        appError: errorDetails.appError,
        details: responseDetails,
      },
      AllExceptionFilter.name,
    );

    res.status(status).json(payload);
  }
}

export { AllExceptionFilter as ApiExceptionFilter };

function resolveDurationSeconds(startTime?: number): number {
  if (!startTime || !Number.isFinite(startTime)) {
    return 0;
  }
  return Number(((Date.now() - startTime) / 1000).toFixed(3));
}

interface ExtractedExceptionDetails {
  message: string;
  rootCause: string;
  stack?: string[];
  responseDetails?: Record<string, unknown>;
  upstream?: Record<string, unknown>;
  appError?: Record<string, unknown>;
}

function extractExceptionDetails(exception: unknown): ExtractedExceptionDetails {
  const baseMessage = exception instanceof Error ? exception.message : 'Internal server error';
  const details = extractResponseObject(exception);
  const appError = extractAppError(details);
  const upstream = extractUpstreamDetails(details, appError);
  const rootCause = pickRootCause(exception, details, appError);
  return {
    message: pickString(appError?.message) ?? baseMessage,
    rootCause,
    stack: compactStack(exception),
    responseDetails: flattenDetails(details),
    upstream,
    appError,
  };
}

function extractResponseObject(exception: unknown): Record<string, unknown> | undefined {
  if (!(exception instanceof HttpException)) {
    return undefined;
  }
  const response = exception.getResponse();
  if (typeof response === 'string') {
    return { message: response };
  }
  if (response && typeof response === 'object') {
    return response as Record<string, unknown>;
  }
  return undefined;
}

function extractAppError(response: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const candidate = response?.appError;
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    return candidate as Record<string, unknown>;
  }
  return undefined;
}

function extractUpstreamDetails(
  response: Record<string, unknown> | undefined,
  appError: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const details = isRecord(appError?.details) ? appError?.details : isRecord(response?.details) ? response?.details : undefined;
  if (!isRecord(details)) {
    return undefined;
  }
  const output: Record<string, unknown> = {};
  const service = pickString(response?.service) ?? pickString((details as Record<string, unknown>).service);
  if (service) {
    output.service = service;
  }
  const keys = [
    'code',
    'vendor',
    'operation',
    'providerOperation',
    'retryable',
    'awsErrorName',
    'awsMessage',
    'awsStatusCode',
    'awsRequestId',
    'awsFault',
    'thingName',
    'productCode',
    'region',
  ];
  for (const key of keys) {
    const value = appError?.[key] ?? (details as Record<string, unknown>)[key];
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function flattenDetails(input: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!input) {
    return undefined;
  }
  const details = isRecord(input.details) ? input.details : input;
  const flattened: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (key === 'details') {
      continue;
    }
    flattened[key] = value;
  }
  return Object.keys(flattened).length > 0 ? flattened : undefined;
}

function normalizeResponseDetails(
  exception: unknown,
  details: Record<string, unknown> | undefined,
  localizedMessage: string,
): Record<string, unknown> | undefined {
  if (!details) {
    return undefined;
  }
  if (isGenericRouteNotFoundException(exception, details)) {
    const routeContext = extractRouteNotFoundContext(pickString(details.message));
    return {
      message: localizedMessage,
      ...(routeContext?.method ? { method: routeContext.method } : {}),
      ...(routeContext?.path ? { path: routeContext.path } : {}),
    };
  }
  if (!isGenericFrameworkException(exception, details)) {
    return details;
  }
  return {
    message: localizedMessage,
  };
}

function pickRootCause(
  exception: unknown,
  response: Record<string, unknown> | undefined,
  appError: Record<string, unknown> | undefined,
): string {
  const candidates = [
    pickString(appError?.message),
    pickString(appError?.rawMessage),
    pickString(response?.rawMessage),
    pickString(response?.message),
    exception instanceof Error ? exception.message : undefined,
  ];
  for (const item of candidates) {
    if (item) {
      return item;
    }
  }
  return 'Internal server error';
}

function isGenericRouteNotFoundException(
  exception: unknown,
  details: Record<string, unknown>,
): boolean {
  if (!(exception instanceof HttpException) || exception.getStatus() !== HttpStatus.NOT_FOUND) {
    return false;
  }
  const message = pickString(details.message);
  const error = pickString(details.error);
  return Boolean(message?.startsWith('Cannot ') && error === 'Not Found');
}

function isGenericFrameworkException(
  exception: unknown,
  details: Record<string, unknown>,
): boolean {
  if (!(exception instanceof HttpException)) {
    return false;
  }

  const status = exception.getStatus();
  const message = pickString(details.message);
  const error = pickString(details.error);

  if (Array.isArray(details.errors) && details.errors.length > 0) {
    return false;
  }

  if (status === HttpStatus.BAD_REQUEST) {
    return message === 'Bad Request Exception' || message === 'Bad Request';
  }
  if (status === HttpStatus.UNAUTHORIZED) {
    return message === 'Unauthorized' || error === 'Unauthorized';
  }
  if (status === HttpStatus.FORBIDDEN) {
    return message === 'Forbidden resource' || message === 'Forbidden' || error === 'Forbidden';
  }
  return false;
}

function extractRouteNotFoundContext(message?: string): { method?: string; path?: string } | undefined {
  if (!message) {
    return undefined;
  }
  const match = message.match(/^Cannot\s+([A-Z]+)\s+(.+)$/);
  if (!match) {
    return undefined;
  }
  const [, method, path] = match;
  return {
    method,
    path,
  };
}

function resolveStatus(exception: unknown): number {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

function compactStack(exception: unknown): string[] | undefined {
  if (!(exception instanceof Error) || !exception.stack) {
    return undefined;
  }
  return exception.stack
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
