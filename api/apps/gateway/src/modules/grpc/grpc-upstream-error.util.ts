interface ParsedGrpcAppError {
  name?: string;
  code?: string;
  message?: string;
  status?: number;
  vendor?: string;
  operation?: string;
  providerOperation?: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
}

export interface ParsedGrpcUpstreamError {
  grpcCode?: number | string;
  message?: string;
  appError?: ParsedGrpcAppError;
  details?: Record<string, unknown>;
}

function isObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function tryParseJson(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return isObject(parsed) ? parsed : undefined;
  } catch {
    const start = value.indexOf('{');
    const end = value.lastIndexOf('}');
    if (start < 0 || end <= start) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(value.slice(start, end + 1)) as unknown;
      return isObject(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
}

/** Parses AppError payload carried over gRPC and flattens safe details. */
export function parseGrpcUpstreamError(
  error: unknown,
  service: string,
): ParsedGrpcUpstreamError {
  const target = isObject(error) ? error : {};
  const detailsPayload =
    tryParseJson(target.details)
    ?? (isObject(target.details) ? target.details : undefined)
    ?? tryParseJson(target.message);

  const nestedAppError = detailsPayload?.appError;
  const directAppError = target.appError;
  const appErrorRaw = isObject(nestedAppError)
    ? nestedAppError
    : isObject(directAppError)
      ? directAppError
      : undefined;

  const appError = appErrorRaw
    ? ({
      name: typeof appErrorRaw.name === 'string' ? appErrorRaw.name : undefined,
      code: typeof appErrorRaw.code === 'string' ? appErrorRaw.code : undefined,
      message: typeof appErrorRaw.message === 'string' ? appErrorRaw.message : undefined,
      status: typeof appErrorRaw.status === 'number' ? appErrorRaw.status : undefined,
      vendor: typeof appErrorRaw.vendor === 'string' ? appErrorRaw.vendor : undefined,
      operation: typeof appErrorRaw.operation === 'string' ? appErrorRaw.operation : undefined,
      providerOperation:
        typeof appErrorRaw.providerOperation === 'string'
          ? appErrorRaw.providerOperation
          : undefined,
      details: isObject(appErrorRaw.details) ? appErrorRaw.details : undefined,
      retryable: typeof appErrorRaw.retryable === 'boolean' ? appErrorRaw.retryable : undefined,
    } satisfies ParsedGrpcAppError)
    : undefined;

  const flatDetails = appError
    ? {
      service,
      ...(appError.code ? { code: appError.code } : {}),
      ...(appError.vendor ? { vendor: appError.vendor } : {}),
      ...(appError.operation ? { operation: appError.operation } : {}),
      ...(appError.providerOperation ? { providerOperation: appError.providerOperation } : {}),
      ...(typeof appError.retryable === 'boolean' ? { retryable: appError.retryable } : {}),
      ...(appError.details ?? {}),
    }
    : undefined;

  return {
    grpcCode:
      typeof target.code === 'number' || typeof target.code === 'string'
        ? (target.code as number | string)
        : undefined,
    message:
      appError?.message
      ?? (typeof target.message === 'string' ? target.message : undefined)
      ?? (typeof target.details === 'string' ? target.details : undefined),
    appError,
    details: flatDetails,
  };
}
