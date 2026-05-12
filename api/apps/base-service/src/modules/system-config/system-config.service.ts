import { Injectable } from '@nestjs/common';
import type { AdminSystemServiceName } from '../system/system-admin-router.service';

@Injectable()
export class SystemConfigService {
  getStatus(): string {
    return 'base-system-config-ready';
  }

  owns(service: AdminSystemServiceName): boolean {
    return service === 'configs';
  }
}
