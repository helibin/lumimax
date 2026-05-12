import { Controller, Inject } from '@nestjs/common';
import type { AuthenticatedUser } from '@lumimax/auth';
import {
  parseGrpcJson,
  resolveGrpcRequestId,
} from '@lumimax/integration/grpc/gateway-grpc.util';
import {
  parseGrpcFacadeExecutePayload,
} from '@lumimax/integration/grpc/facade-execute.util';
import { GrpcMethod } from '@nestjs/microservices';
import { DietFacade } from './diet.facade';
import { resolveTenantId } from '../common/tenant-scope.util';

@Controller()
export class DietFacadeGrpcController {
  constructor(@Inject(DietFacade) private readonly dietFacade: DietFacade) {}

  @GrpcMethod('BizDietFacadeService', 'Execute')
  async execute(
    payload: Parameters<typeof parseGrpcFacadeExecutePayload<AuthenticatedUser | null>>[0],
    metadata?: unknown,
  ) {
    return this.dietFacade.execute(
      parseGrpcFacadeExecutePayload<AuthenticatedUser | null>(payload, metadata),
    );
  }

  @GrpcMethod('BizDietFacadeService', 'CallAdmin')
  async callAdmin(
    payload: {
      request_id?: string;
      service?: string;
      method?: string;
      payload_json?: string;
    },
    metadata?: unknown,
  ) {
    const data = await this.dietFacade.callAdmin({
      service: (payload.service ?? 'meals') as 'meals' | 'foods' | 'recognitionLogs',
      method: payload.method ?? '',
      payload: parseGrpcJson<Record<string, unknown>>(payload.payload_json, {}),
      tenantId: resolveTenantId(
        String(
          parseGrpcJson<Record<string, unknown>>(payload.payload_json, {}).tenantId
            ?? parseGrpcJson<Record<string, unknown>>(payload.payload_json, {}).tenant_id
            ?? '',
        ),
      ),
      requestId: resolveGrpcRequestId(payload.request_id, metadata),
    });
    return {
      json: JSON.stringify(data ?? {}),
    };
  }
}
