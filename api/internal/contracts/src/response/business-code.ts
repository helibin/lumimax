import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';

export type BusinessErrorKey =
  | 'ok'
  | 'user.noauth'
  | 'auth.invalid_credentials'
  | 'user.token_invalid'
  | 'user.not_registered'
  | 'user.disabled'
  | 'request.invalid_params'
  | 'request.validation_failed'
  | 'user.forbidden'
  | 'resource.not_found'
  | 'resource.conflict'
  | 'request.too_many'
  | 'request.unprocessable'
  | 'iot.topic_invalid'
  | 'iot.topic_forbidden'
  | 'iot.device_not_found'
  | 'iot.device_connection_disabled'
  | 'iot.credential_not_matched'
  | 'iot.credential_inactive'
  | 'iot.emqx_queue_mode_http_ingest_disabled'
  | 'upstream.unavailable'
  | 'upstream.timeout'
  | 'system.internal_error';

export interface BusinessError {
  code: number;
  key: BusinessErrorKey;
}

export enum BusinessCode {
  SUCCESS = 0,
  USER_NOAUTH = 40001,
  USER_TOKEN_INVALID = 40002,
  AUTH_INVALID_CREDENTIALS = 40101,
  USER_NOT_REGISTERED = 40402,
  USER_DISABLED = 40302,
  REQUEST_INVALID_PARAMS = 40003,
  REQUEST_VALIDATION_FAILED = 40004,
  USER_FORBIDDEN = 40301,
  RESOURCE_NOT_FOUND = 40401,
  RESOURCE_CONFLICT = 40901,
  REQUEST_TOO_MANY = 42901,
  REQUEST_UNPROCESSABLE = 42201,
  IOT_TOPIC_INVALID = 42210,
  IOT_TOPIC_FORBIDDEN = 40310,
  IOT_DEVICE_NOT_FOUND = 40410,
  IOT_DEVICE_CONNECTION_DISABLED = 40311,
  IOT_CREDENTIAL_NOT_MATCHED = 40312,
  IOT_CREDENTIAL_INACTIVE = 40313,
  /** EMQX + mq mode: HTTP/gRPC uplink ingest disabled (use RabbitMQ bridge only). */
  IOT_EMQX_QUEUE_MODE_HTTP_INGEST_DISABLED = 40911,
  UPSTREAM_UNAVAILABLE = 50301,
  UPSTREAM_TIMEOUT = 50401,
  INTERNAL_ERROR = 50000,
  BAD_REQUEST = REQUEST_INVALID_PARAMS,
  UNAUTHORIZED = USER_NOAUTH,
  FORBIDDEN = USER_FORBIDDEN,
  NOT_FOUND = RESOURCE_NOT_FOUND,
  CONFLICT = RESOURCE_CONFLICT,
  TOO_MANY_REQUESTS = REQUEST_TOO_MANY,
  UNPROCESSABLE_ENTITY = REQUEST_UNPROCESSABLE,
  SERVICE_UNAVAILABLE = UPSTREAM_UNAVAILABLE,
  GATEWAY_TIMEOUT = UPSTREAM_TIMEOUT,
}

export function mapExceptionToBusinessCode(exception: unknown): number {
  return mapExceptionToBusinessError(exception).code;
}

export function mapExceptionToBusinessError(exception: unknown): BusinessError {
  if (exception instanceof BadRequestException) {
    if (isValidationException(exception)) {
      return {
        code: BusinessCode.REQUEST_VALIDATION_FAILED,
        key: 'request.validation_failed',
      };
    }
    return {
      code: BusinessCode.REQUEST_INVALID_PARAMS,
      key: 'request.invalid_params',
    };
  }
  if (exception instanceof UnauthorizedException) {
    if (isInvalidCredentialException(exception)) {
      return {
        code: BusinessCode.AUTH_INVALID_CREDENTIALS,
        key: 'auth.invalid_credentials',
      };
    }
    if (isNoAuthException(exception)) {
      return {
        code: BusinessCode.USER_NOAUTH,
        key: 'user.noauth',
      };
    }
    return {
      code: BusinessCode.USER_TOKEN_INVALID,
      key: 'user.token_invalid',
    };
  }
  if (exception instanceof ForbiddenException) {
    if (isUserDisabledException(exception)) {
      return {
        code: BusinessCode.USER_DISABLED,
        key: 'user.disabled',
      };
    }
    return {
      code: BusinessCode.USER_FORBIDDEN,
      key: 'user.forbidden',
    };
  }
  if (exception instanceof NotFoundException) {
    if (isUserNotRegisteredException(exception)) {
      return {
        code: BusinessCode.USER_NOT_REGISTERED,
        key: 'user.not_registered',
      };
    }
    return {
      code: BusinessCode.RESOURCE_NOT_FOUND,
      key: 'resource.not_found',
    };
  }
  if (exception instanceof ConflictException) {
    const response = exception.getResponse();
    if (isRecord(response)) {
      const embeddedCode = readNumericCode(response.businessCode ?? response.code);
      const embeddedKey = typeof response.key === 'string' ? response.key : undefined;
      if (
        embeddedCode === BusinessCode.IOT_EMQX_QUEUE_MODE_HTTP_INGEST_DISABLED
        && embeddedKey === 'iot.emqx_queue_mode_http_ingest_disabled'
      ) {
        return {
          code: BusinessCode.IOT_EMQX_QUEUE_MODE_HTTP_INGEST_DISABLED,
          key: 'iot.emqx_queue_mode_http_ingest_disabled',
        };
      }
    }
    return {
      code: BusinessCode.RESOURCE_CONFLICT,
      key: 'resource.conflict',
    };
  }
  if (exception instanceof UnprocessableEntityException) {
    return {
      code: BusinessCode.REQUEST_UNPROCESSABLE,
      key: 'request.unprocessable',
    };
  }
  if (exception instanceof ServiceUnavailableException) {
    return {
      code: BusinessCode.UPSTREAM_UNAVAILABLE,
      key: 'upstream.unavailable',
    };
  }
  if (exception instanceof GatewayTimeoutException) {
    return {
      code: BusinessCode.UPSTREAM_TIMEOUT,
      key: 'upstream.timeout',
    };
  }
  if (exception instanceof BadGatewayException) {
    return {
      code: BusinessCode.UPSTREAM_UNAVAILABLE,
      key: 'upstream.unavailable',
    };
  }
  if (exception instanceof HttpException && exception.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
    return {
      code: BusinessCode.REQUEST_TOO_MANY,
      key: 'request.too_many',
    };
  }
  if (exception instanceof InternalServerErrorException) {
    return {
      code: BusinessCode.INTERNAL_ERROR,
      key: 'system.internal_error',
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status === HttpStatus.BAD_REQUEST) {
      return {
        code: BusinessCode.REQUEST_INVALID_PARAMS,
        key: 'request.invalid_params',
      };
    }
    if (status === HttpStatus.UNAUTHORIZED) {
      if (isInvalidCredentialException(exception)) {
        return {
          code: BusinessCode.AUTH_INVALID_CREDENTIALS,
          key: 'auth.invalid_credentials',
        };
      }
      if (isNoAuthException(exception)) {
        return {
          code: BusinessCode.USER_NOAUTH,
          key: 'user.noauth',
        };
      }
      return {
        code: BusinessCode.USER_TOKEN_INVALID,
        key: 'user.token_invalid',
      };
    }
    if (status === HttpStatus.FORBIDDEN) {
      if (isUserDisabledException(exception)) {
        return {
          code: BusinessCode.USER_DISABLED,
          key: 'user.disabled',
        };
      }
      return {
        code: BusinessCode.USER_FORBIDDEN,
        key: 'user.forbidden',
      };
    }
    if (status === HttpStatus.NOT_FOUND) {
      if (isUserNotRegisteredException(exception)) {
        return {
          code: BusinessCode.USER_NOT_REGISTERED,
          key: 'user.not_registered',
        };
      }
      return {
        code: BusinessCode.RESOURCE_NOT_FOUND,
        key: 'resource.not_found',
      };
    }
    if (status === HttpStatus.CONFLICT) {
      return {
        code: BusinessCode.RESOURCE_CONFLICT,
        key: 'resource.conflict',
      };
    }
    if (status === HttpStatus.UNPROCESSABLE_ENTITY) {
      return {
        code: BusinessCode.REQUEST_UNPROCESSABLE,
        key: 'request.unprocessable',
      };
    }
    if (status === HttpStatus.BAD_GATEWAY) {
      return {
        code: BusinessCode.UPSTREAM_UNAVAILABLE,
        key: 'upstream.unavailable',
      };
    }
    if (status === HttpStatus.SERVICE_UNAVAILABLE) {
      return {
        code: BusinessCode.UPSTREAM_UNAVAILABLE,
        key: 'upstream.unavailable',
      };
    }
    if (status === HttpStatus.GATEWAY_TIMEOUT) {
      return {
        code: BusinessCode.UPSTREAM_TIMEOUT,
        key: 'upstream.timeout',
      };
    }
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      return {
        code: BusinessCode.REQUEST_TOO_MANY,
        key: 'request.too_many',
      };
    }
    return {
      code: BusinessCode.INTERNAL_ERROR,
      key: 'system.internal_error',
    };
  }
  return {
    code: BusinessCode.INTERNAL_ERROR,
    key: 'system.internal_error',
  };
}

function isValidationException(exception: HttpException): boolean {
  const response = exception.getResponse();
  if (typeof response === 'string') {
    return response.toLowerCase().includes('validation failed');
  }
  if (response && typeof response === 'object') {
    const target = response as Record<string, unknown>;
    const message = target.message;
    if (typeof message === 'string' && message.toLowerCase().includes('validation failed')) {
      return true;
    }
    if (Array.isArray(target.errors) && target.errors.length > 0) {
      return true;
    }
  }
  const message = exception.message ?? '';
  return message.toLowerCase().includes('validation failed');
}

function isNoAuthException(exception: HttpException): boolean {
  const message = extractExceptionMessage(exception).toLowerCase();
  return message.includes('missing bearer token')
    || message.includes('missing user context')
    || message.includes('missing token')
    || message.includes('no auth')
    || message.includes('not authorized');
}

function isInvalidCredentialException(exception: HttpException): boolean {
  const searchText = extractExceptionSearchText(exception);
  return searchText.includes('invalid admin credentials')
    || searchText.includes('invalid username or password')
    || searchText.includes('invalid credentials')
    || searchText.includes('password mismatch');
}

function isUserNotRegisteredException(exception: HttpException): boolean {
  const message = extractExceptionMessage(exception).toLowerCase();
  return message.includes('user not registered')
    || message.includes('account not registered')
    || message.includes('user does not exist');
}

function isUserDisabledException(exception: HttpException): boolean {
  const message = extractExceptionMessage(exception).toLowerCase();
  return message.includes('user account is disabled')
    || message.includes('account disabled')
    || message.includes('user disabled')
    || message.includes('user is unavailable');
}

function extractExceptionMessage(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  if (response && typeof response === 'object') {
    const target = response as Record<string, unknown>;
    const message = target.message;
    if (Array.isArray(message)) {
      return message.join('; ');
    }
    if (typeof message === 'string') {
      return message;
    }
  }
  return exception.message ?? '';
}

function extractExceptionSearchText(exception: HttpException): string {
  const candidates: string[] = [];
  const primary = extractExceptionMessage(exception);
  if (primary) {
    candidates.push(primary);
  }

  const response = exception.getResponse();
  if (response && typeof response === 'object') {
    const target = response as Record<string, unknown>;
    const details = asRecord(target.details);
    const appError = asRecord(target.appError);
    const nestedCandidates = [
      target.rawMessage,
      details?.message,
      details?.rawMessage,
      appError?.message,
      appError?.rawMessage,
    ];
    for (const item of nestedCandidates) {
      if (typeof item === 'string' && item.trim().length > 0) {
        candidates.push(item);
      }
    }
  }

  return candidates.join(' | ').toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumericCode(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
