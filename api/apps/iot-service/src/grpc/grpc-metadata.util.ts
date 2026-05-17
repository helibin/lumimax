import { injectRequestIdToGrpcMetadata } from '@lumimax/runtime';
import { Metadata } from '@grpc/grpc-js';

export function createGrpcMetadata(requestId: string): Metadata {
  return injectRequestIdToGrpcMetadata(new Metadata(), requestId) as Metadata;
}
