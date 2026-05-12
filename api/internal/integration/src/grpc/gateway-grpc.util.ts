import { HttpException, HttpStatus } from '@nestjs/common';
import {
  readRequestIdFromGrpcMetadata,
  type GrpcMetadataLike,
} from '@lumimax/runtime';
import { generateRequestId } from '@lumimax/runtime';

export interface GatewayGrpcReply {
  success: boolean;
  data_json?: string;
  dataJson?: string;
  request_id?: string;
  requestId?: string;
  http_status?: number;
  httpStatus?: number;
  business_code?: number;
  businessCode?: number;
  message: string;
  details_json?: string;
  detailsJson?: string;
}

export function buildGatewayGrpcSuccess(
  data: unknown,
  requestId = generateRequestId(),
): GatewayGrpcReply {
  const dataJson = stringifyGrpcJson(data);
  return {
    success: true,
    data_json: dataJson,
    dataJson,
    request_id: requestId,
    requestId,
    http_status: HttpStatus.OK,
    httpStatus: HttpStatus.OK,
    business_code: 0,
    businessCode: 0,
    message: 'ok',
    details_json: '',
    detailsJson: '',
  };
}

export function buildGatewayGrpcError(
  error: unknown,
  requestId = generateRequestId(),
): GatewayGrpcReply {
  const resolved = resolveGrpcError(error);
  const dataJson = 'null';
  const detailsJson = resolved.details ? stringifyGrpcJson(resolved.details) : '';
  return {
    success: false,
    data_json: dataJson,
    dataJson,
    request_id: requestId,
    requestId,
    http_status: resolved.httpStatus,
    httpStatus: resolved.httpStatus,
    business_code: resolved.businessCode,
    businessCode: resolved.businessCode,
    message: resolved.message,
    details_json: detailsJson,
    detailsJson,
  };
}

export function unwrapGatewayGrpcReply<T>(reply: GatewayGrpcReply): T {
  const normalized = normalizeGatewayGrpcReply(reply);
  if (!normalized.success) {
    const details = parseGrpcJson<Record<string, unknown> | null>(
      normalized.details_json,
      null,
    );
    throw new HttpException(
      {
        message: normalized.message || 'Internal server error',
        ...(details ? { details } : {}),
      },
      normalized.http_status || HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  return parseGrpcJson<T>(normalized.data_json, null as T);
}

export function parseGrpcJson<T>(value: string | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function stringifyGrpcJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function resolveGrpcRequestId(
  payloadRequestId?: string,
  metadata?: unknown,
): string {
  return payloadRequestId
    ?? readRequestIdFromGrpcMetadata(metadata as GrpcMetadataLike)
    ?? generateRequestId();
}

function resolveGrpcError(error: unknown): {
  httpStatus: number;
  businessCode: number;
  message: string;
  details?: Record<string, unknown>;
} {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const httpStatus = error.getStatus();
    if (typeof response === 'string') {
      return {
        httpStatus,
        businessCode: 0,
        message: response,
      };
    }
    if (response && typeof response === 'object') {
      const target = response as Record<string, unknown>;
      const rawMessage = target.message;
      const message = Array.isArray(rawMessage)
        ? rawMessage.join('; ')
        : typeof rawMessage === 'string'
          ? rawMessage
          : error.message;
      const flatDetails =
        target.details && typeof target.details === 'object'
          ? target.details as Record<string, unknown>
          : target;
      return {
        httpStatus,
        businessCode: 0,
        message,
        details: flatDetails,
      };
    }
    return {
      httpStatus,
      businessCode: 0,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
      businessCode: 0,
      message: error.message || 'Internal server error',
    };
  }

  return {
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    businessCode: 0,
    message: 'Internal server error',
  };
}

function normalizeGatewayGrpcReply(reply: GatewayGrpcReply): Required<GatewayGrpcReply> {
  return {
    success: Boolean(reply.success),
    data_json: reply.data_json ?? reply.dataJson ?? '',
    dataJson: reply.dataJson ?? reply.data_json ?? '',
    request_id: reply.request_id ?? reply.requestId ?? '',
    requestId: reply.requestId ?? reply.request_id ?? '',
    http_status: reply.http_status ?? reply.httpStatus ?? 0,
    httpStatus: reply.httpStatus ?? reply.http_status ?? 0,
    business_code: reply.business_code ?? reply.businessCode ?? 0,
    businessCode: reply.businessCode ?? reply.business_code ?? 0,
    message: reply.message ?? '',
    details_json: reply.details_json ?? reply.detailsJson ?? '',
    detailsJson: reply.detailsJson ?? reply.details_json ?? '',
  };
}
