import { Injectable } from '@nestjs/common';
import type { AdminSystemServiceName } from '../system/system-admin-router.service';

@Injectable()
export class AdminService {
  getStatus(): string {
    return 'base-admin-ready';
  }

  owns(service: AdminSystemServiceName): boolean {
    return service === 'auth' || service === 'accounts' || service === 'dashboard';
  }
}
