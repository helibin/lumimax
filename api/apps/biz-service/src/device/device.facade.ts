import type { AuthenticatedUser } from '@lumimax/auth';
import { Inject, Injectable } from '@nestjs/common';
import { DeviceApplicationService } from './devices/device-application.service';
import type { DeviceOperationPort } from './device-operation.port';

@Injectable()
export class DeviceFacade implements DeviceOperationPort {
  constructor(
    @Inject(DeviceApplicationService)
    private readonly deviceApplicationService: DeviceApplicationService,
  ) {}

  async execute<T = unknown>(input: {
    operation: string;
    params: Record<string, unknown>;
    query: Record<string, unknown>;
    body: Record<string, unknown>;
    user: AuthenticatedUser | null;
    tenantScope?: string;
    requestId: string;
  }) {
    return this.deviceApplicationService.execute<T>(input);
  }
}
