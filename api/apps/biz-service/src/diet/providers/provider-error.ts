export type ExternalServiceErrorKind =
  | 'timeout'
  | 'rate_limit'
  | 'unauthorized'
  | 'not_found'
  | 'unavailable'
  | 'network'
  | 'bad_response';

export class ExternalServiceError extends Error {
  readonly kind: ExternalServiceErrorKind;
  readonly method: 'GET' | 'POST';
  readonly url: string;
  readonly statusCode?: number;
  readonly retryable: boolean;
  readonly userMessage: string;
  readonly responsePreview?: unknown;

  constructor(input: {
    message: string;
    kind: ExternalServiceErrorKind;
    method: 'GET' | 'POST';
    url: string;
    statusCode?: number;
    retryable?: boolean;
    userMessage: string;
    responsePreview?: unknown;
  }) {
    super(input.message);
    this.name = 'ExternalServiceError';
    this.kind = input.kind;
    this.method = input.method;
    this.url = input.url;
    this.statusCode = input.statusCode;
    this.retryable = input.retryable ?? false;
    this.userMessage = input.userMessage;
    this.responsePreview = input.responsePreview;
  }
}

export function isExternalServiceError(error: unknown): error is ExternalServiceError {
  return error instanceof ExternalServiceError;
}

export function isExternalServiceTimeoutError(error: unknown): boolean {
  return isExternalServiceError(error) && error.kind === 'timeout';
}

export function isExternalServiceRetriableError(error: unknown): boolean {
  return isExternalServiceError(error) && error.retryable;
}
