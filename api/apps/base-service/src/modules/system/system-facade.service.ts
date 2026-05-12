import { Inject, Injectable } from '@nestjs/common';
import {
  buildGatewayGrpcError,
  buildGatewayGrpcSuccess,
} from '@lumimax/integration/grpc/gateway-grpc.util';
import type { AdminSystemServiceName } from './system-admin-router.service';
import { SystemAdminRouterService } from './system-admin-router.service';

@Injectable()
export class SystemFacadeService {
  constructor(
    @Inject(SystemAdminRouterService)
    private readonly systemAdminRouterService: SystemAdminRouterService,
  ) {}

  async callAdminSystem(input: {
    requestId: string;
    service: AdminSystemServiceName;
    method: string;
    payloadJson?: string;
    tenantScope?: string;
  }): Promise<{ json: string }> {
    try {
      const result = await this.systemAdminRouterService.dispatchAdmin(input);
      return {
        json: JSON.stringify(buildGatewayGrpcSuccess(result ?? {}, input.requestId)),
      };
    } catch (error) {
      return {
        json: JSON.stringify(buildGatewayGrpcError(error, input.requestId)),
      };
    }
  }

  async callDictionary(input: {
    requestId: string;
    method: string;
    payloadJson?: string;
    tenantScope?: string;
  }): Promise<{ json: string }> {
    try {
      const result = await this.systemAdminRouterService.dispatchDictionary(input);
      return {
        json: JSON.stringify(buildGatewayGrpcSuccess(result ?? {}, input.requestId)),
      };
    } catch (error) {
      return {
        json: JSON.stringify(buildGatewayGrpcError(error, input.requestId)),
      };
    }
  }
}
