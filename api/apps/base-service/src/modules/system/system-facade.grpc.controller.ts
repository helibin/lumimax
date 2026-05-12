import { Controller, Inject } from '@nestjs/common';
import { resolveGrpcRequestId } from '@lumimax/integration/grpc/gateway-grpc.util';
import { GrpcMethod } from '@nestjs/microservices';
import { SystemFacadeService } from './system-facade.service';

@Controller()
export class SystemFacadeGrpcController {
  constructor(
    @Inject(SystemFacadeService) private readonly systemFacadeService: SystemFacadeService,
  ) {}

  @GrpcMethod('BaseSystemFacadeService', 'CallAdminSystem')
  callAdminSystem(
    payload: {
      request_id?: string;
      service?: string;
      method?: string;
      payload_json?: string;
      tenant_scope?: string;
    },
    metadata?: unknown,
  ) {
    return this.systemFacadeService.callAdminSystem({
      requestId: resolveGrpcRequestId(payload.request_id, metadata),
      service: (payload.service ?? 'auth') as
        | 'auth'
        | 'accounts'
        | 'dashboard'
        | 'roles'
        | 'permissions'
        | 'menus'
        | 'dictionaries'
        | 'configs'
        | 'auditLogs',
      method: payload.method ?? '',
      payloadJson: payload.payload_json,
      tenantScope: payload.tenant_scope ?? '',
    });
  }

  @GrpcMethod('BaseSystemFacadeService', 'CallDictionary')
  callDictionary(
    payload: {
      request_id?: string;
      method?: string;
      payload_json?: string;
      tenant_scope?: string;
    },
    metadata?: unknown,
  ) {
    return this.systemFacadeService.callDictionary({
      requestId: resolveGrpcRequestId(payload.request_id, metadata),
      method: payload.method ?? '',
      payloadJson: payload.payload_json,
      tenantScope: payload.tenant_scope ?? '',
    });
  }
}
