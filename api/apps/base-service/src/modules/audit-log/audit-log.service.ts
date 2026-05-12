import { Injectable } from '@nestjs/common';
import type { AdminSystemServiceName } from '../system/system-admin-router.service';

@Injectable()
export class AuditLogService {
  getStatus(): string {
    return 'base-audit-log-ready';
  }

  owns(service: AdminSystemServiceName): boolean {
    return service === 'auditLogs';
  }
}
