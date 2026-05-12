import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { EnvService } from '@lumimax/config';
import { AppLogger } from '@lumimax/logger';
import { parseGrpcUpstreamError } from './grpc/grpc-upstream-error.util';

@Injectable()
export class GrpcInvokerService {
  constructor(
    @Inject(EnvService) private readonly envService: EnvService,
    @Inject(AppLogger) private readonly logger: AppLogger,
  ) {}

  async invoke<T>(input: {
    service: string;
    operation: string;
    requestId?: string;
    call: () => Promise<T>;
  }): Promise<T> {
    const timeoutMs = this.envService.getNumber('GATEWAY_GRPC_TIMEOUT_MS', 5000) ?? 5000;
    const retryCount = this.envService.getNumber('GATEWAY_GRPC_RETRY_COUNT', 1) ?? 1;
    const retryDelayMs = this.envService.getNumber('GATEWAY_GRPC_RETRY_DELAY_MS', 120) ?? 120;

    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      try {
        this.logger.debug('网关发起 gRPC 调用', {
          service: input.service,
          operation: input.operation,
          attempt: attempt + 1,
        }, GrpcInvokerService.name);
        const data = await this.invokeWithTimeout(input.call, timeoutMs, input.service, input.operation);

        this.logger.debug('<<< 网关收到 gRPC 响应', {
          service: input.service,
          operation: input.operation,
          attempt: attempt + 1,
        }, GrpcInvokerService.name);
        return data;
      } catch (error) {
        const shouldRetry = attempt < retryCount && this.isRetryableConnectionError(error);
        if (shouldRetry) {
          this.logger.warn('网关 gRPC 调用重试中', {
            service: input.service,
            operation: input.operation,
            attempt: attempt + 1,
            retryInMs: retryDelayMs,
            reason: this.extractErrorMessage(error),
          }, GrpcInvokerService.name);
          await sleep(retryDelayMs);
          continue;
        }

        const mapped = this.mapGrpcError(error, input.service, input.operation);
        this.logger.error('<<< 网关 gRPC 调用失败', {
          service: input.service,
          operation: input.operation,
          statusCode: mapped.getStatus(),
          reason: mapped.message,
          attempt: attempt + 1,
        }, GrpcInvokerService.name);
        throw mapped;
      }
    }

    throw new ServiceUnavailableException(`gRPC ${input.service}/${input.operation} 当前不可用`);
  }

  private async invokeWithTimeout<T>(
    call: () => Promise<T>,
    timeoutMs: number,
    service: string,
    operation: string,
  ): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        call(),
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(
              new GatewayTimeoutException(
                `gRPC ${service}/${operation} timeout (${timeoutMs}ms)`,
              ),
            );
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private isRetryableConnectionError(error: unknown): boolean {
    const normalized = this.normalizeErrorCode(error);
    if (
      normalized === 14
      || normalized === 'UNAVAILABLE'
      || normalized === 'ECONNREFUSED'
      || normalized === 'ECONNRESET'
      || normalized === 'EHOSTUNREACH'
      || normalized === 'ENOTFOUND'
      || normalized === 'ETIMEDOUT'
      || normalized === 'ESOCKETTIMEDOUT'
    ) {
      return true;
    }

    const message = this.extractErrorMessage(error) ?? '';
    return (
      message.includes('ECONNREFUSED')
      || message.includes('ECONNRESET')
      || message.includes('UNAVAILABLE')
    );
  }

  private mapGrpcError(
    error: unknown,
    service: string,
    operation: string,
  ): HttpException {
    if (error instanceof HttpException) {
      return error;
    }

    const parsed = parseGrpcUpstreamError(error, service);
    const errorCode = this.normalizeErrorCode(error, parsed.grpcCode);
    const upstreamStatus = parsed.appError?.status;
    const message = parsed.appError?.message
      ?? this.extractErrorMessage(error, parsed.message)
      ?? `gRPC ${service}/${operation} failed`;
    const details = parsed.details;

    if (errorCode === 3 || errorCode === 'INVALID_ARGUMENT') {
      return new BadRequestException({ message, ...(details ? { details } : {}) });
    }
    if (errorCode === 4 || errorCode === 'DEADLINE_EXCEEDED' || errorCode === 'ETIMEDOUT') {
      return new GatewayTimeoutException({ message, ...(details ? { details } : {}) });
    }
    if (errorCode === 5 || errorCode === 'NOT_FOUND') {
      return new NotFoundException({ message, ...(details ? { details } : {}) });
    }
    if (errorCode === 6 || errorCode === 'ALREADY_EXISTS') {
      return new ConflictException({ message, ...(details ? { details } : {}) });
    }
    if (errorCode === 7 || errorCode === 'PERMISSION_DENIED') {
      return new ForbiddenException({ message, ...(details ? { details } : {}) });
    }
    if (errorCode === 8 || errorCode === 'RESOURCE_EXHAUSTED') {
      return new HttpException(
        { message, ...(details ? { details } : {}) },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (errorCode === 14 || errorCode === 'UNAVAILABLE') {
      return new ServiceUnavailableException({ message, ...(details ? { details } : {}) });
    }
    if (errorCode === 16 || errorCode === 'UNAUTHENTICATED') {
      return new UnauthorizedException({ message, ...(details ? { details } : {}) });
    }
    if (
      errorCode === 'ECONNREFUSED'
      || errorCode === 'EHOSTUNREACH'
      || errorCode === 'ENOTFOUND'
    ) {
      return new ServiceUnavailableException({ message, ...(details ? { details } : {}) });
    }
    if (errorCode === 'ESOCKETTIMEDOUT') {
      return new GatewayTimeoutException({ message, ...(details ? { details } : {}) });
    }

    if (upstreamStatus === HttpStatus.BAD_REQUEST) {
      return new BadRequestException({ message, ...(details ? { details } : {}) });
    }
    if (upstreamStatus === HttpStatus.UNAUTHORIZED) {
      return new UnauthorizedException({ message, ...(details ? { details } : {}) });
    }
    if (upstreamStatus === HttpStatus.FORBIDDEN) {
      return new ForbiddenException({ message, ...(details ? { details } : {}) });
    }
    if (upstreamStatus === HttpStatus.NOT_FOUND) {
      return new NotFoundException({ message, ...(details ? { details } : {}) });
    }
    if (upstreamStatus === HttpStatus.CONFLICT) {
      return new ConflictException({ message, ...(details ? { details } : {}) });
    }
    if (upstreamStatus === HttpStatus.SERVICE_UNAVAILABLE) {
      return new ServiceUnavailableException({ message, ...(details ? { details } : {}) });
    }

    return new BadGatewayException({ message, ...(details ? { details } : {}) });
  }

  private normalizeErrorCode(
    error: unknown,
    parsedCode?: number | string,
  ): number | string | undefined {
    if (parsedCode !== undefined) {
      return parsedCode;
    }
    if (!error || typeof error !== 'object') {
      return undefined;
    }
    const candidate = error as { code?: unknown; details?: unknown };
    if (typeof candidate.code === 'number') {
      return candidate.code;
    }
    if (typeof candidate.code === 'string') {
      return candidate.code;
    }
    if (typeof candidate.details === 'string') {
      if (candidate.details.includes('UNAVAILABLE')) {
        return 'UNAVAILABLE';
      }
      if (candidate.details.includes('DEADLINE_EXCEEDED')) {
        return 'DEADLINE_EXCEEDED';
      }
    }
    return undefined;
  }

  private extractErrorMessage(error: unknown, fallback?: string): string | undefined {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim().length > 0) {
        return message;
      }
    }
    return fallback;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
