import { Controller, Inject } from '@nestjs/common';
import {
  buildGatewayGrpcError,
  buildGatewayGrpcSuccess,
} from '@lumimax/integration/grpc/gateway-grpc.util';
import {
  parseGrpcFacadeExecutePayload,
} from '@lumimax/integration/grpc/facade-execute.util';
import { GrpcMethod } from '@nestjs/microservices';
import { StorageFacadeService } from './storage-facade.service';

@Controller()
export class StorageFacadeGrpcController {
  constructor(
    @Inject(StorageFacadeService)
    private readonly storageFacadeService: StorageFacadeService,
  ) {}

  @GrpcMethod('BaseStorageFacadeService', 'Execute')
  async execute(
    payload: Parameters<typeof parseGrpcFacadeExecutePayload>[0],
    metadata?: unknown,
  ) {
    const input = parseGrpcFacadeExecutePayload(payload, metadata);
    try {
      const data = await this.storageFacadeService.execute(input);
      return buildGatewayGrpcSuccess(data, input.requestId);
    } catch (error) {
      return buildGatewayGrpcError(error, input.requestId);
    }
  }
}
