import { Inject, Injectable } from '@nestjs/common';
import { AdminApplicationService } from '../admin/admin-application.service';
import { AdminService } from '../admin/admin.service';
import { AuditLogApplicationService } from '../audit-log/audit-log-application.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { DictionaryApplicationService } from '../dictionary/dictionary-application.service';
import { DictionaryService } from '../dictionary/dictionary.service';
import { MenuApplicationService } from '../menu/menu-application.service';
import { MenuService } from '../menu/menu.service';
import { PermissionApplicationService } from '../permission/permission-application.service';
import { PermissionService } from '../permission/permission.service';
import { RoleApplicationService } from '../role/role-application.service';
import { RoleService } from '../role/role.service';
import { SystemConfigApplicationService } from '../system-config/system-config-application.service';
import { SystemConfigService } from '../system-config/system-config.service';

export type AdminSystemServiceName =
  | 'auth'
  | 'accounts'
  | 'dashboard'
  | 'roles'
  | 'permissions'
  | 'menus'
  | 'dictionaries'
  | 'configs'
  | 'auditLogs';

@Injectable()
export class SystemAdminRouterService {
  constructor(
    @Inject(AdminApplicationService)
    private readonly adminApplicationService: AdminApplicationService,
    @Inject(AdminService) private readonly adminService: AdminService,
    @Inject(RoleApplicationService)
    private readonly roleApplicationService: RoleApplicationService,
    @Inject(RoleService) private readonly roleService: RoleService,
    @Inject(PermissionApplicationService)
    private readonly permissionApplicationService: PermissionApplicationService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(MenuApplicationService)
    private readonly menuApplicationService: MenuApplicationService,
    @Inject(MenuService) private readonly menuService: MenuService,
    @Inject(DictionaryApplicationService)
    private readonly dictionaryApplicationService: DictionaryApplicationService,
    @Inject(DictionaryService) private readonly dictionaryService: DictionaryService,
    @Inject(SystemConfigApplicationService)
    private readonly systemConfigApplicationService: SystemConfigApplicationService,
    @Inject(SystemConfigService) private readonly systemConfigService: SystemConfigService,
    @Inject(AuditLogApplicationService)
    private readonly auditLogApplicationService: AuditLogApplicationService,
    @Inject(AuditLogService) private readonly auditLogService: AuditLogService,
  ) {}

  async dispatchAdmin(input: {
    requestId: string;
    service: AdminSystemServiceName;
    method: string;
    payloadJson?: string;
    tenantScope?: string;
  }): Promise<Record<string, unknown>> {
    const owner = this.resolveOwner(input.service);
    if (owner === 'admin') {
      return this.adminApplicationService.dispatch({
        requestId: input.requestId,
        service: input.service as 'auth' | 'accounts' | 'dashboard',
        method: input.method,
        payloadJson: input.payloadJson,
        tenantScope: input.tenantScope,
      });
    }
    if (owner === 'role') {
      return this.roleApplicationService.dispatch({
        requestId: input.requestId,
        method: input.method,
        payloadJson: input.payloadJson,
        tenantScope: input.tenantScope,
      });
    }
    if (owner === 'permission') {
      return this.permissionApplicationService.dispatch({
        requestId: input.requestId,
        method: input.method,
        payloadJson: input.payloadJson,
        tenantScope: input.tenantScope,
      });
    }
    if (owner === 'menu') {
      return this.menuApplicationService.dispatch({
        requestId: input.requestId,
        method: input.method,
        payloadJson: input.payloadJson,
        tenantScope: input.tenantScope,
      });
    }
    if (owner === 'dictionary') {
      return this.dictionaryApplicationService.dispatchAdmin({
        requestId: input.requestId,
        method: input.method,
        payloadJson: input.payloadJson,
        tenantScope: input.tenantScope,
      });
    }
    if (owner === 'system-config') {
      return this.systemConfigApplicationService.dispatchAdmin({
        requestId: input.requestId,
        method: input.method,
        payloadJson: input.payloadJson,
        tenantScope: input.tenantScope,
      });
    }
    if (owner === 'audit-log') {
      return this.auditLogApplicationService.dispatch({
        requestId: input.requestId,
        method: input.method,
        payloadJson: input.payloadJson,
        tenantScope: input.tenantScope,
      });
    }
    throw new Error(`Unsupported admin system service namespace: ${input.service}`);
  }

  async dispatchDictionary(input: {
    requestId: string;
    method: string;
    payloadJson?: string;
    tenantScope?: string;
  }): Promise<Record<string, unknown>> {
    if (input.method === 'ListConfigItems' || input.method === 'GetConfigItem') {
      return this.systemConfigApplicationService.dispatchPublic(input);
    }
    return this.dictionaryApplicationService.dispatchPublic(input);
  }

  private resolveOwner(service: AdminSystemServiceName): string {
    if (this.adminService.owns(service)) {
      return 'admin';
    }
    if (this.roleService.owns(service)) {
      return 'role';
    }
    if (this.permissionService.owns(service)) {
      return 'permission';
    }
    if (this.menuService.owns(service)) {
      return 'menu';
    }
    if (this.dictionaryService.ownsAdmin(service)) {
      return 'dictionary';
    }
    if (this.systemConfigService.owns(service)) {
      return 'system-config';
    }
    if (this.auditLogService.owns(service)) {
      return 'audit-log';
    }
    throw new Error(`Unsupported admin system service namespace: ${service}`);
  }
}
