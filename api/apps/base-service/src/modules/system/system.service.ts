import { Inject, Injectable } from '@nestjs/common';
import { AdminService } from '../admin/admin.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { DictionaryService } from '../dictionary/dictionary.service';
import { PermissionService } from '../permission/permission.service';
import { RoleService } from '../role/role.service';
import { SystemConfigService } from '../system-config/system-config.service';

@Injectable()
export class SystemService {
  constructor(
    @Inject(AdminService) private readonly adminService: AdminService,
    @Inject(RoleService) private readonly roleService: RoleService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(DictionaryService) private readonly dictionaryService: DictionaryService,
    @Inject(SystemConfigService) private readonly systemConfigService: SystemConfigService,
    @Inject(AuditLogService) private readonly auditLogService: AuditLogService,
  ) {}

  getStatus(): string {
    return 'base-system-ready';
  }

  getModuleStatuses(): string[] {
    return [
      this.getStatus(),
      this.adminService.getStatus(),
      this.roleService.getStatus(),
      this.permissionService.getStatus(),
      this.dictionaryService.getStatus(),
      this.systemConfigService.getStatus(),
      this.auditLogService.getStatus(),
    ];
  }
}
