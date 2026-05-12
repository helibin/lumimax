import type { GrpcMetadataLike } from './trace.types';
export declare function readRequestIdFromHeaders(headers?: Record<string, unknown>): string | undefined;
export declare function injectRequestIdToHttpHeaders(requestId: string, headers?: Record<string, string>): Record<string, string>;
export declare function injectRequestIdToGrpcMetadata(metadata: GrpcMetadataLike, requestId: string): GrpcMetadataLike;
export declare function readRequestIdFromGrpcMetadata(metadata?: GrpcMetadataLike): string | undefined;
