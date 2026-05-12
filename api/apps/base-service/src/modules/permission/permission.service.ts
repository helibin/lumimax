import { Injectable } from '@nestjs/common';
import type { AdminSystemServiceName } from '../system/system-admin-router.service';

@Injectable()
export class PermissionService {
  getStatus(): string {
    return 'base-permission-ready';
  }

  owns(service: AdminSystemServiceName): boolean {
    return service === 'permissions';
  }
}
