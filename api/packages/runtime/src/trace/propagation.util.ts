import { REQUEST_ID_HEADER } from './trace.constants';
import type { GrpcMetadataLike } from './trace.types';

export function readRequestIdFromHeaders(
  headers?: Record<string, unknown>,
): string | undefined {
  const raw = headers?.[REQUEST_ID_HEADER];
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw;
  }
  return undefined;
}

export function injectRequestIdToHttpHeaders(
  requestId: string,
  headers: Record<string, string> = {},
): Record<string, string> {
  return {
    ...headers,
    [REQUEST_ID_HEADER]: requestId,
  };
}

export function injectRequestIdToGrpcMetadata(
  metadata: GrpcMetadataLike,
  requestId: string,
): GrpcMetadataLike {
  metadata.set(REQUEST_ID_HEADER, requestId);
  return metadata;
}

export function readRequestIdFromGrpcMetadata(
  metadata?: GrpcMetadataLike,
): string | undefined {
  if (!metadata?.get) {
    return undefined;
  }
  const raw = metadata.get(REQUEST_ID_HEADER);

  if (Array.isArray(raw)) {
    const value = raw[0];
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
  }

  return typeof raw === 'string' && raw.trim().length > 0 ? raw : undefined;
}

