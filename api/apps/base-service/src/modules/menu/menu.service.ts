import { Injectable } from '@nestjs/common';
import type { AdminSystemServiceName } from '../system/system-admin-router.service';

@Injectable()
export class MenuService {
  getStatus(): string {
    return 'base-menu-ready';
  }

  owns(service: AdminSystemServiceName): boolean {
    return service === 'menus';
  }
}
