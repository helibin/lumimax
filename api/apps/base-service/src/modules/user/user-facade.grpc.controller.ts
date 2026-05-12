import { Controller, Inject } from '@nestjs/common';
import { resolveGrpcRequestId } from '@lumimax/integration/grpc/gateway-grpc.util';
import { GrpcMethod } from '@nestjs/microservices';
import { UserFacadeService } from './user-facade.service';

@Controller()
export class UserFacadeGrpcController {
  constructor(
    @Inject(UserFacadeService) private readonly userFacadeService: UserFacadeService,
  ) {}

  @GrpcMethod('BaseUserFacadeService', 'Execute')
  execute(
    payload: {
      operation?: string;
      params_json?: string;
      query_json?: string;
      body_json?: string;
      user_json?: string;
      tenant_scope?: string;
      request_id?: string;
    },
    metadata?: unknown,
  ) {
    return this.userFacadeService.execute({
      operation: payload.operation ?? '',
      paramsJson: payload.params_json,
      queryJson: payload.query_json,
      bodyJson: payload.body_json,
      userJson: payload.user_json,
      tenantScope: payload.tenant_scope,
      requestId: resolveGrpcRequestId(payload.request_id, metadata),
    });
  }
}
