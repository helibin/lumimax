import { injectRequestIdToGrpcMetadata } from '@lumimax/runtime';

export function createGrpcMetadata(requestId: string): any {
  const grpc = require('@grpc/grpc-js') as { Metadata: new () => any };
  const metadata = new grpc.Metadata();
  return injectRequestIdToGrpcMetadata(metadata, requestId);
}
