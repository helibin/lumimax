import { Injectable } from '@nestjs/common';
import type { AdminSystemServiceName } from '../system/system-admin-router.service';

@Injectable()
export class RoleService {
  getStatus(): string {
    return 'base-role-ready';
  }

  owns(service: AdminSystemServiceName): boolean {
    return service === 'roles';
  }
}
