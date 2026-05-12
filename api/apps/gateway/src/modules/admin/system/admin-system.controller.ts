import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import { AdminPermissionGuard } from '../auth/admin-permission.guard';
import { AdminPermission } from '../auth/admin-permission.decorator';
import type {
  AdminPageQueryDto,
  AdminAuditLogQueryDto,
  AdminStatusBodyDto,
  CreateAdminUserDto,
  CreateDictionaryDto,
  CreateDictionaryItemDto,
  CreateRoleDto,
  CreateSystemMenuDto,
  CreateSystemConfigDto,
  ResetAdminUserPasswordDto,
  UpdateAdminUserDto,
  UpdateDictionaryDto,
  UpdateDictionaryItemDto,
  UpdateRoleMenusDto,
  UpdateRoleDto,
  UpdateRolePermissionsDto,
  UpdateSystemMenuDto,
  UpdateSystemConfigDto,
} from '../dto/admin-common.dto';
import { GrpcInvokerService } from '../../grpc-invoker.service';
import { BaseSystemAdminGrpcAdapter } from '../../../grpc/base-service.grpc-client';
import { jsonString, normalizeAdminPaged } from '../admin-response.util';

@UseGuards(AdminJwtGuard, AdminPermissionGuard)
@ApiTags('后台系统管理接口')
@ApiBearerAuth('bearer')
@Controller('api/admin')
export class AdminSystemController {
  constructor(
    @Inject(GrpcInvokerService) private readonly grpcInvoker: GrpcInvokerService,
    @Inject(BaseSystemAdminGrpcAdapter)
    private readonly baseSystemAdminGrpcAdapter: BaseSystemAdminGrpcAdapter,
  ) {}

  @Get('system/admin-users')
  @AdminPermission('admin-user:view')
  @ApiOperation({ summary: '查询后台管理员列表' })
  adminUsers(@Req() req: any, @Query() query: AdminPageQueryDto) {
    return this.system(req, 'accounts', 'ListAdminUsers', {
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword ?? '',
    }, true);
  }

  @Get('system/admin-users/:id')
  @AdminPermission('admin-user:view')
  adminUser(@Req() req: any, @Param('id') id: string) {
    return this.system(req, 'accounts', 'GetAdminUser', { id });
  }

  @Post('system/admin-users')
  @AdminPermission('admin-user:create')
  createAdminUser(@Req() req: any, @Body() body: CreateAdminUserDto) {
    return this.system(req, 'accounts', 'CreateAdminUser', withAuditActor(req, {
      username: body.username,
      password: body.password,
      nickname: body.nickname,
      email: body.email ?? '',
      phone: body.phone ?? '',
      role_ids: body.roleIds ?? [],
    }));
  }

  @Patch('system/admin-users/:id')
  @AdminPermission('admin-user:update')
  updateAdminUser(@Req() req: any, @Param('id') id: string, @Body() body: UpdateAdminUserDto) {
    return this.system(req, 'accounts', 'UpdateAdminUser', withAuditActor(req, {
      id,
      nickname: body.nickname ?? '',
      email: body.email ?? '',
      phone: body.phone ?? '',
      role_ids: body.roleIds ?? [],
    }));
  }

  @Patch('system/admin-users/:id/status')
  @AdminPermission('admin-user:disable')
  updateAdminUserStatus(@Req() req: any, @Param('id') id: string, @Body() body: AdminStatusBodyDto) {
    return this.system(req, 'accounts', 'UpdateAdminUserStatus', withAuditActor(req, { id, status: body.status }));
  }

  @Patch('system/admin-users/:id/password')
  @AdminPermission('admin-user:update')
  resetAdminUserPassword(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: ResetAdminUserPasswordDto,
  ) {
    return this.system(req, 'accounts', 'ResetAdminUserPassword', withAuditActor(req, {
      id,
      new_password: body.newPassword,
    }));
  }

  @Get('system/roles')
  @AdminPermission('role:view')
  @ApiOperation({ summary: '查询角色列表' })
  roles(@Req() req: any, @Query() query: AdminPageQueryDto) {
    return this.system(req, 'roles', 'ListRoles', {
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword ?? '',
    }, true);
  }

  @Get('system/roles/:id')
  @AdminPermission('role:view')
  role(@Req() req: any, @Param('id') id: string) {
    return this.system(req, 'roles', 'GetRole', { id });
  }

  @Post('system/roles')
  @AdminPermission('role:create')
  createRole(@Req() req: any, @Body() body: CreateRoleDto) {
    return this.system(req, 'roles', 'CreateRole', withAuditActor(req, { ...body }));
  }

  @Patch('system/roles/:id')
  @AdminPermission('role:update')
  updateRole(@Req() req: any, @Param('id') id: string, @Body() body: UpdateRoleDto) {
    return this.system(req, 'roles', 'UpdateRole', withAuditActor(req, { id, ...body }));
  }

  @Patch('system/roles/:id/status')
  @AdminPermission('role:update')
  updateRoleStatus(@Req() req: any, @Param('id') id: string, @Body() body: AdminStatusBodyDto) {
    return this.system(req, 'roles', 'UpdateRoleStatus', withAuditActor(req, { id, status: body.status }));
  }

  @Get('system/permissions')
  @AdminPermission('role:view')
  @ApiOperation({ summary: '查询权限列表' })
  permissions(@Req() req: any, @Query('keyword') keyword?: string, @Query('groupCode') groupCode?: string) {
    return this.system(req, 'permissions', 'ListPermissions', {
      keyword: keyword ?? '',
      group_code: groupCode ?? '',
    });
  }

  @Put('system/roles/:id/permissions')
  @AdminPermission('role:permission')
  updateRolePermissions(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdateRolePermissionsDto,
  ) {
    return this.system(req, 'roles', 'UpdateRolePermissions', withAuditActor(req, {
      role_id: id,
      permission_ids: body.permissionIds,
    }));
  }

  @Get('system/menus')
  @AdminPermission('role:view')
  @ApiOperation({ summary: '查询菜单列表/树' })
  menus(@Req() req: any, @Query('keyword') keyword?: string) {
    return this.system(req, 'menus', 'ListMenus', {
      keyword: keyword ?? '',
    });
  }

  @Get('system/menus/current')
  @ApiOperation({ summary: '查询当前管理员可见菜单树' })
  currentMenus(@Req() req: any) {
    return this.system(req, 'menus', 'GetAdminMenus', {
      admin_id: req.user?.userId ?? '',
    });
  }

  @Get('system/menus/:id')
  @AdminPermission('role:view')
  menu(@Req() req: any, @Param('id') id: string) {
    return this.system(req, 'menus', 'GetMenu', { id });
  }

  @Post('system/menus')
  @AdminPermission('role:update')
  createMenu(@Req() req: any, @Body() body: CreateSystemMenuDto) {
    return this.system(req, 'menus', 'CreateMenu', withAuditActor(req, toMenuPayload(body)));
  }

  @Patch('system/menus/:id')
  @AdminPermission('role:update')
  updateMenu(@Req() req: any, @Param('id') id: string, @Body() body: UpdateSystemMenuDto) {
    return this.system(req, 'menus', 'UpdateMenu', withAuditActor(req, { id, ...toMenuPayload(body) }));
  }

  @Patch('system/menus/:id/status')
  @AdminPermission('role:update')
  updateMenuStatus(@Req() req: any, @Param('id') id: string, @Body() body: AdminStatusBodyDto) {
    return this.system(req, 'menus', 'UpdateMenuStatus', withAuditActor(req, { id, status: body.status }));
  }

  @Delete('system/menus/:id')
  @AdminPermission('role:update')
  deleteMenu(@Req() req: any, @Param('id') id: string) {
    return this.system(req, 'menus', 'DeleteMenu', withAuditActor(req, { id }));
  }

  @Get('system/roles/:id/menus')
  @AdminPermission('role:view')
  roleMenus(@Req() req: any, @Param('id') id: string) {
    return this.system(req, 'menus', 'GetRoleMenus', { role_id: id });
  }

  @Put('system/roles/:id/menus')
  @AdminPermission('role:update')
  updateRoleMenus(@Req() req: any, @Param('id') id: string, @Body() body: UpdateRoleMenusDto) {
    return this.system(req, 'menus', 'UpdateRoleMenus', withAuditActor(req, {
      role_id: id,
      menu_ids: body.menuIds,
    }));
  }

  @Get('dictionaries')
  @AdminPermission('dictionary:view')
  @ApiOperation({ summary: '查询字典列表' })
  dictionaries(@Req() req: any, @Query() query: AdminPageQueryDto) {
    return this.system(req, 'dictionaries', 'ListDictionaries', {
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword ?? '',
    }, true);
  }

  @Post('dictionaries')
  @AdminPermission('dictionary:create')
  createDictionary(@Req() req: any, @Body() body: CreateDictionaryDto) {
    return this.system(req, 'dictionaries', 'CreateDictionary', withAuditActor(req, { ...body }));
  }

  @Patch('dictionaries/:code')
  @AdminPermission('dictionary:update')
  updateDictionary(
    @Req() req: any,
    @Param('code') code: string,
    @Body() body: UpdateDictionaryDto,
  ) {
    return this.system(req, 'dictionaries', 'UpdateDictionary', withAuditActor(req, {
      code,
      name: body.name,
      description: body.description,
    }));
  }

  @Delete('dictionaries/:code')
  @AdminPermission('dictionary:delete')
  deleteDictionary(@Req() req: any, @Param('code') code: string) {
    return this.system(req, 'dictionaries', 'DeleteDictionary', withAuditActor(req, { code }));
  }

  @Get('dictionaries/:code/items')
  @AdminPermission('dictionary:view')
  dictionaryItems(@Req() req: any, @Param('code') code: string) {
    return this.system(req, 'dictionaries', 'ListDictionaryItems', { code });
  }

  @Post('dictionaries/:code/items')
  @AdminPermission('dictionary:create')
  createDictionaryItem(
    @Req() req: any,
    @Param('code') code: string,
    @Body() body: CreateDictionaryItemDto,
  ) {
    return this.system(req, 'dictionaries', 'CreateDictionaryItem', withAuditActor(req, {
      dictionary_code: code,
      label: body.label,
      value: body.value,
      sort: body.sort ?? 0,
      status: body.status ?? 'active',
      extra_json: jsonString(body.extra ?? {}),
    }));
  }

  @Patch('dictionaries/items/:id')
  @AdminPermission('dictionary:update')
  updateDictionaryItem(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdateDictionaryItemDto,
  ) {
    return this.system(req, 'dictionaries', 'UpdateDictionaryItem', withAuditActor(req, {
      id,
      label: body.label,
      value: body.value,
      sort: body.sort ?? 0,
      status: body.status ?? 'active',
      extra_json: jsonString(body.extra ?? {}),
    }));
  }

  @Delete('dictionaries/items/:id')
  @AdminPermission('dictionary:delete')
  deleteDictionaryItem(@Req() req: any, @Param('id') id: string) {
    return this.system(req, 'dictionaries', 'DeleteDictionaryItem', withAuditActor(req, { id }));
  }

  @Get('system/configs')
  @AdminPermission('system-config:view')
  @ApiOperation({ summary: '查询系统配置列表' })
  configs(@Req() req: any, @Query() query: AdminPageQueryDto) {
    return this.system(req, 'configs', 'ListSystemConfigs', {
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword ?? '',
    }, true);
  }

  @Post('system/configs')
  @AdminPermission('system-config:create')
  createConfig(@Req() req: any, @Body() body: CreateSystemConfigDto) {
    return this.system(req, 'configs', 'CreateSystemConfig', withAuditActor(req, toConfigPayload(body)));
  }

  @Patch('system/configs/:id')
  @AdminPermission('system-config:update')
  updateConfig(@Req() req: any, @Param('id') id: string, @Body() body: UpdateSystemConfigDto) {
    return this.system(req, 'configs', 'UpdateSystemConfig', withAuditActor(req, { id, ...toConfigPayload(body) }));
  }

  @Patch('system/configs/:id/status')
  @AdminPermission('system-config:update')
  updateConfigStatus(@Req() req: any, @Param('id') id: string, @Body() body: AdminStatusBodyDto) {
    return this.system(req, 'configs', 'UpdateSystemConfigStatus', withAuditActor(req, { id, status: body.status }));
  }

  @Get('audit-logs')
  @AdminPermission('audit-log:view')
  @ApiOperation({ summary: '查询审计日志列表' })
  auditLogs(
    @Req() req: any,
    @Query() query: AdminAuditLogQueryDto,
  ) {
    return this.system(req, 'auditLogs', 'ListAuditLogs', {
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword ?? '',
      resource_type: query.resourceType ?? '',
      action: query.action ?? '',
      start_at: query.startAt ?? '',
      end_at: query.endAt ?? '',
    }, true);
  }

  private async system(
    req: any,
    service:
      | 'auth'
      | 'accounts'
      | 'roles'
      | 'permissions'
      | 'menus'
      | 'dictionaries'
      | 'configs'
      | 'auditLogs',
    method: string,
    payload: Record<string, unknown>,
    paged = false,
  ) {
    const result = await this.grpcInvoker.invoke({
      service: 'base-service',
      operation: `admin.${service}.${method}`,
      requestId: req.requestId,
      call: () => this.baseSystemAdminGrpcAdapter.call(service, method, payload, req.requestId),
    });
    return paged ? normalizeAdminPaged(result) : result;
  }
}

function toConfigPayload(body: CreateSystemConfigDto | UpdateSystemConfigDto) {
  return {
    config_key: body.configKey,
    config_value: body.configValue,
    value_type: body.valueType,
    group_code: body.groupCode,
    name: body.name,
    description: body.description ?? '',
    is_encrypted: Boolean(body.isEncrypted),
  };
}

function toMenuPayload(body: CreateSystemMenuDto | UpdateSystemMenuDto) {
  return {
    code: body.code,
    name: body.name,
    parent_id: body.parentId,
    menu_type: body.menuType,
    route_path: body.routePath,
    component: body.component,
    icon: body.icon,
    permission_code: body.permissionCode,
    sort: body.sort,
    visible: body.visible,
    keep_alive: body.keepAlive,
    external_link: body.externalLink,
    extra_json: body.extra ?? {},
  };
}

function withAuditActor(req: any, payload: Record<string, unknown>) {
  return {
    ...payload,
    operatorId: req.user?.userId ?? 'system',
    operatorName:
      req.user?.nickname
      ?? req.user?.username
      ?? req.user?.userId
      ?? 'system',
  };
}
