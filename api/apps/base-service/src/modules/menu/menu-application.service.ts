import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { toUtcIso } from '@lumimax/http-kit';
import type { Repository } from 'typeorm';
import { In, IsNull } from 'typeorm';
import { AuditLogApplicationService } from '../audit-log/audit-log-application.service';
import {
  SystemAdminRoleEntity,
  SystemMenuEntity,
  SystemPermissionEntity,
  SystemRoleMenuEntity,
  SystemRolePermissionEntity,
  SystemRoleEntity,
} from '../system/entities/system.entities';
import { parseFacadeJsonObject } from '../shared/base-facade.util';

type MenuNode = Record<string, unknown> & { children: MenuNode[] };

@Injectable()
export class MenuApplicationService {
  constructor(
    @InjectRepository(SystemMenuEntity)
    private readonly menuRepository: Repository<SystemMenuEntity>,
    @InjectRepository(SystemRoleMenuEntity)
    private readonly roleMenuRepository: Repository<SystemRoleMenuEntity>,
    @InjectRepository(SystemRoleEntity)
    private readonly roleRepository: Repository<SystemRoleEntity>,
    @InjectRepository(SystemAdminRoleEntity)
    private readonly adminRoleRepository: Repository<SystemAdminRoleEntity>,
    @InjectRepository(SystemRolePermissionEntity)
    private readonly rolePermissionRepository: Repository<SystemRolePermissionEntity>,
    @InjectRepository(SystemPermissionEntity)
    private readonly permissionRepository: Repository<SystemPermissionEntity>,
    @Inject(AuditLogApplicationService)
    private readonly auditLogApplicationService: AuditLogApplicationService,
  ) {}

  async dispatch(input: {
    requestId: string;
    method: string;
    payloadJson?: string;
    tenantScope?: string;
  }): Promise<Record<string, unknown>> {
    const payload = parseFacadeJsonObject(input.payloadJson);
    const tenantId = input.tenantScope?.trim() || undefined;
    switch (input.method) {
      case 'ListMenus':
        return this.listMenus(payload, tenantId);
      case 'GetMenu':
        return this.getMenu(payload, tenantId);
      case 'CreateMenu':
        return this.createMenu(payload, input.requestId, tenantId);
      case 'UpdateMenu':
        return this.updateMenu(payload, input.requestId, tenantId);
      case 'UpdateMenuStatus':
        return this.updateMenuStatus(payload, input.requestId, tenantId);
      case 'DeleteMenu':
        return this.deleteMenu(payload, input.requestId, tenantId);
      case 'GetRoleMenus':
        return this.getRoleMenus(payload, tenantId);
      case 'UpdateRoleMenus':
        return this.updateRoleMenus(payload, input.requestId, tenantId);
      case 'GetAdminMenus':
        return this.getAdminMenus(payload, tenantId);
      default:
        throw new Error(`Unsupported menu method: ${input.method}`);
    }
  }

  private async listMenus(
    payload: Record<string, unknown>,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const keyword = String(payload.keyword ?? '').trim().toLowerCase();
    const items = await this.menuRepository.find({
      where: tenantId ? { deletedAt: IsNull(), tenantId } : { deletedAt: IsNull() },
      order: { sort: 'ASC', createdAt: 'ASC' },
    });
    const filtered = keyword
      ? items.filter((item) =>
        item.code.toLowerCase().includes(keyword)
        || item.name.toLowerCase().includes(keyword)
        || String(item.routePath ?? '').toLowerCase().includes(keyword),
      )
      : items;
    return {
      items: filtered.map((item) => this.toMenu(item)),
      tree_json: JSON.stringify(this.buildMenuTree(filtered.map((item) => this.toMenu(item)))),
      tree: this.buildMenuTree(filtered.map((item) => this.toMenu(item))),
      routeTree: this.buildRouteMenuTree(filtered),
    };
  }

  private async getMenu(
    payload: Record<string, unknown>,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const id = pickString(payload.id);
    if (!id) {
      throw new Error('menu id is required');
    }
    const menu = await this.menuRepository.findOne({
      where: tenantId ? { id, tenantId } : { id },
    });
    if (!menu) {
      throw new Error(`menu not found: ${id}`);
    }
    return this.toMenu(menu);
  }

  private async createMenu(
    payload: Record<string, unknown>,
    requestId: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const targetTenantId = resolveTargetTenantId(
      pickString(payload.tenantId) ?? null,
      tenantId ?? null,
    );
    const code = pickString(payload.code);
    const name = pickString(payload.name);
    if (!code || !name) {
      throw new Error('menu code and name are required');
    }
    await this.assertParentExists(payload.parent_id ?? payload.parentId, tenantId);
    const entity = await this.menuRepository.save(
      this.menuRepository.create({
        code,
        name,
        parentId: pickString(payload.parent_id) ?? pickString(payload.parentId) ?? null,
        menuType: pickString(payload.menu_type) ?? pickString(payload.menuType) ?? 'menu',
        routePath: pickString(payload.route_path) ?? pickString(payload.routePath) ?? null,
        component: pickString(payload.component) ?? null,
        icon: pickString(payload.icon) ?? null,
        permissionCode: pickString(payload.permission_code) ?? pickString(payload.permissionCode) ?? null,
        sort: pickNumber(payload.sort) ?? 0,
        visible: pickBoolean(payload.visible, true),
        keepAlive: pickBoolean(payload.keep_alive ?? payload.keepAlive, false),
        externalLink: pickString(payload.external_link) ?? pickString(payload.externalLink) ?? null,
        status: pickString(payload.status) ?? 'active',
        extraJson: pickObject(payload.extra_json) ?? pickObject(payload.extra) ?? null,
        tenantId: targetTenantId,
      }),
    );
    await this.writeAuditLog(payload, requestId, targetTenantId ?? undefined, {
      action: 'system-menu.create',
      resourceId: entity.id,
      resourceType: 'system_menu',
      after: this.toMenu(entity),
    });
    return this.toMenu(entity);
  }

  private async updateMenu(
    payload: Record<string, unknown>,
    requestId: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const id = pickString(payload.id);
    if (!id) {
      throw new Error('menu id is required');
    }
    const menu = await this.menuRepository.findOne({
      where: tenantId ? { id, tenantId } : { id },
    });
    if (!menu) {
      throw new Error(`menu not found: ${id}`);
    }
    const before = this.toMenu(menu);
    const nextParentId = pickString(payload.parent_id) ?? pickString(payload.parentId);
    if (nextParentId !== undefined) {
      if (nextParentId === id) {
        throw new Error('menu parent cannot be itself');
      }
      await this.assertParentExists(nextParentId, tenantId);
      menu.parentId = nextParentId ?? null;
    }
    menu.code = pickString(payload.code) ?? menu.code;
    menu.name = pickString(payload.name) ?? menu.name;
    menu.menuType = pickString(payload.menu_type) ?? pickString(payload.menuType) ?? menu.menuType;
    menu.routePath = pickString(payload.route_path) ?? pickString(payload.routePath) ?? menu.routePath;
    menu.component = pickString(payload.component) ?? menu.component;
    menu.icon = pickString(payload.icon) ?? menu.icon;
    menu.permissionCode = pickString(payload.permission_code) ?? pickString(payload.permissionCode) ?? menu.permissionCode;
    menu.sort = pickNumber(payload.sort) ?? menu.sort;
    menu.visible = pickBoolean(payload.visible, menu.visible);
    menu.keepAlive = pickBoolean(payload.keep_alive ?? payload.keepAlive, menu.keepAlive);
    menu.externalLink = pickString(payload.external_link) ?? pickString(payload.externalLink) ?? menu.externalLink;
    menu.extraJson = pickObject(payload.extra_json) ?? pickObject(payload.extra) ?? menu.extraJson ?? null;
    const saved = await this.menuRepository.save(menu);
    await this.writeAuditLog(payload, requestId, saved.tenantId ?? tenantId, {
      action: 'system-menu.update',
      resourceId: saved.id,
      resourceType: 'system_menu',
      before,
      after: this.toMenu(saved),
    });
    return this.toMenu(saved);
  }

  private async updateMenuStatus(
    payload: Record<string, unknown>,
    requestId: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const id = pickString(payload.id);
    const status = pickString(payload.status);
    if (!id || !status) {
      throw new Error('menu id and status are required');
    }
    const menu = await this.menuRepository.findOne({
      where: tenantId ? { id, tenantId } : { id },
    });
    if (!menu) {
      throw new Error(`menu not found: ${id}`);
    }
    const before = this.toMenu(menu);
    menu.status = status;
    const saved = await this.menuRepository.save(menu);
    await this.writeAuditLog(payload, requestId, saved.tenantId ?? tenantId, {
      action: 'system-menu.status',
      resourceId: saved.id,
      resourceType: 'system_menu',
      before,
      after: this.toMenu(saved),
    });
    return this.toMenu(saved);
  }

  private async deleteMenu(
    payload: Record<string, unknown>,
    requestId: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const id = pickString(payload.id);
    if (!id) {
      throw new Error('menu id is required');
    }
    const menu = await this.menuRepository.findOne({
      where: tenantId ? { id, tenantId } : { id },
    });
    if (!menu) {
      throw new Error(`menu not found: ${id}`);
    }
    const before = this.toMenu(menu);
    const childCount = await this.menuRepository.count({
      where: tenantId ? { parentId: id, deletedAt: IsNull(), tenantId } : { parentId: id, deletedAt: IsNull() },
    });
    if (childCount > 0) {
      throw new Error('menu has child nodes');
    }
    await this.roleMenuRepository.delete(tenantId ? { menuId: id, tenantId } : { menuId: id });
    await this.menuRepository.softDelete(id);
    await this.writeAuditLog(payload, requestId, menu.tenantId ?? tenantId, {
      action: 'system-menu.delete',
      resourceId: id,
      resourceType: 'system_menu',
      before,
      after: { deleted: true, id },
    });
    return { ok: true, id };
  }

  private async getRoleMenus(
    payload: Record<string, unknown>,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const roleId = pickString(payload.role_id) ?? pickString(payload.roleId) ?? pickString(payload.id);
    if (!roleId) {
      throw new Error('role id is required');
    }
    const role = await this.roleRepository.findOne({
      where: tenantId ? { id: roleId, tenantId } : { id: roleId },
    });
    if (!role) {
      throw new Error(`role not found: ${roleId}`);
    }
    const menuIds = await this.loadMenuIdsByRoleIds([roleId], tenantId);
    const assignedMenus = menuIds.length > 0
      ? await this.menuRepository.find({
        where: { id: In(menuIds), deletedAt: IsNull() },
        ...(tenantId ? { where: { id: In(menuIds), deletedAt: IsNull(), tenantId } } : {}),
        order: { sort: 'ASC', createdAt: 'ASC' },
      })
      : [];
    return {
      roleId,
      menuIds,
      tree: this.buildMenuTree(assignedMenus.map((item) => this.toMenu(item))),
      routeTree: this.buildRouteMenuTree(assignedMenus),
    };
  }

  private async updateRoleMenus(
    payload: Record<string, unknown>,
    requestId: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const roleId = pickString(payload.role_id) ?? pickString(payload.roleId) ?? pickString(payload.id);
    if (!roleId) {
      throw new Error('role id is required');
    }
    const role = await this.roleRepository.findOne({
      where: tenantId ? { id: roleId, tenantId } : { id: roleId },
    });
    if (!role) {
      throw new Error(`role not found: ${roleId}`);
    }
    const beforeMenuIds = await this.loadMenuIdsByRoleIds([roleId], tenantId);
    const menuIds = pickStringArray(payload.menu_ids, payload.menuIds);
    if (menuIds.length > 0) {
      const menus = await this.menuRepository.find({
        where: tenantId ? { id: In(menuIds), tenantId } : { id: In(menuIds) },
      });
      if (menus.length !== menuIds.length) {
        throw new Error('menu not found');
      }
    }
    const before = {
      menuIds: beforeMenuIds,
      roleId,
    };
    await this.roleMenuRepository.delete(tenantId ? { roleId, tenantId } : { roleId });
    if (menuIds.length > 0) {
      await this.roleMenuRepository.save(
        menuIds.map((menuId) =>
          this.roleMenuRepository.create({
            roleId,
            menuId,
            tenantId: role.tenantId ?? tenantId ?? null,
          }),
        ),
      );
    }
    await this.writeAuditLog(payload, requestId, role.tenantId ?? tenantId, {
      action: 'system-role.menus.update',
      resourceId: roleId,
      resourceType: 'system_role',
      before,
      after: { roleId, menuIds },
    });
    return {
      roleId,
      menuIds,
    };
  }

  private async getAdminMenus(
    payload: Record<string, unknown>,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const adminId = pickString(payload.admin_id) ?? pickString(payload.adminId);
    if (!adminId) {
      throw new Error('admin id is required');
    }
    const roleRows = await this.adminRoleRepository.find({
      where: tenantId ? { adminId, deletedAt: IsNull(), tenantId } : { adminId, deletedAt: IsNull() },
    });
    const roleIds = roleRows.map((item) => item.roleId);
    const [menuIds, permissionCodes] = await Promise.all([
      this.loadMenuIdsByRoleIds(roleIds, tenantId),
      this.loadPermissionCodesByRoleIds(roleIds, tenantId),
    ]);

    const menus = menuIds.length > 0
      ? await this.menuRepository.find({
        where: {
          id: In(menuIds),
          deletedAt: IsNull(),
          status: 'active',
          ...(tenantId ? { tenantId } : {}),
        },
        order: { sort: 'ASC', createdAt: 'ASC' },
      })
      : [];
    const visibleMenus = menus
      .filter((item) => item.visible)
      .filter((item) => !item.permissionCode || permissionCodes.has(item.permissionCode));
    const tree = this.buildMenuTree(visibleMenus.map((item) => this.toMenu(item)));
    return {
      items: visibleMenus.map((item) => this.toMenu(item)),
      tree_json: JSON.stringify(tree),
      tree,
      routeTree: this.buildRouteMenuTree(visibleMenus),
      permissions: [...permissionCodes].sort(),
    };
  }

  private async loadMenuIdsByRoleIds(roleIds: string[], tenantId?: string): Promise<string[]> {
    const dedupedRoleIds = Array.from(new Set(roleIds.filter(Boolean)));
    if (dedupedRoleIds.length === 0) {
      return [];
    }
    const rows = await this.roleMenuRepository.find({
      where: tenantId
        ? { roleId: In(dedupedRoleIds), deletedAt: IsNull(), tenantId }
        : { roleId: In(dedupedRoleIds), deletedAt: IsNull() },
    });
    return Array.from(new Set(rows.map((item) => item.menuId)));
  }

  private async loadPermissionCodesByRoleIds(roleIds: string[], tenantId?: string): Promise<Set<string>> {
    const dedupedRoleIds = Array.from(new Set(roleIds.filter(Boolean)));
    if (dedupedRoleIds.length === 0) {
      return new Set();
    }
    const links = await this.rolePermissionRepository.find({
      where: tenantId
        ? { roleId: In(dedupedRoleIds), deletedAt: IsNull(), tenantId }
        : { roleId: In(dedupedRoleIds), deletedAt: IsNull() },
    });
    const permissionIds = Array.from(new Set(links.map((item) => item.permissionId)));
    if (permissionIds.length === 0) {
      return new Set();
    }
    const permissions = await this.permissionRepository.find({
      where: tenantId
        ? { id: In(permissionIds), deletedAt: IsNull(), tenantId }
        : { id: In(permissionIds), deletedAt: IsNull() },
    });
    return new Set(permissions.map((item) => item.code));
  }

  private async assertParentExists(parentId: unknown, tenantId?: string): Promise<void> {
    const normalized = pickString(parentId);
    if (!normalized) {
      return;
    }
    const parent = await this.menuRepository.findOne({
      where: tenantId ? { id: normalized, deletedAt: IsNull(), tenantId } : { id: normalized, deletedAt: IsNull() },
    });
    if (!parent) {
      throw new Error(`menu parent not found: ${normalized}`);
    }
  }

  private toMenu(entity: SystemMenuEntity): Record<string, unknown> {
    return {
      id: entity.id,
      code: entity.code,
      name: entity.name,
      parentId: entity.parentId ?? null,
      menuType: entity.menuType,
      routePath: entity.routePath ?? null,
      component: entity.component ?? null,
      icon: entity.icon ?? null,
      permissionCode: entity.permissionCode ?? null,
      sort: entity.sort,
      visible: entity.visible,
      keepAlive: entity.keepAlive,
      externalLink: entity.externalLink ?? null,
      status: entity.status,
      extra: entity.extraJson ?? null,
      createdAt: toUtcIso(entity.createdAt),
      updatedAt: toUtcIso(entity.updatedAt),
    };
  }

  private async writeAuditLog(
    payload: Record<string, unknown>,
    requestId: string,
    tenantId: string | undefined,
    input: {
      action: string;
      after?: Record<string, unknown>;
      before?: Record<string, unknown>;
      resourceId?: string;
      resourceType: string;
    },
  ) {
    const actor = resolveAuditActor(payload);
    await this.auditLogApplicationService.dispatch({
      requestId,
      tenantScope: tenantId,
      method: 'CreateAuditLog',
      payloadJson: JSON.stringify({
        operatorId: actor.operatorId,
        operatorName: actor.operatorName,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        before: input.before ?? null,
        after: input.after ?? null,
      }),
    });
  }

  private buildMenuTree(items: Array<Record<string, unknown>>): MenuNode[] {
    const nodeMap = new Map<string, MenuNode>();
    const roots: MenuNode[] = [];
    const sorted = [...items].sort((left, right) =>
      Number(left.sort ?? 0) - Number(right.sort ?? 0)
      || String(left.createdAt ?? '').localeCompare(String(right.createdAt ?? '')),
    );
    for (const item of sorted) {
      const node: MenuNode = {
        ...item,
        children: [],
      };
      nodeMap.set(String(item.id), node);
    }
    for (const node of nodeMap.values()) {
      const parentId = pickString(node.parentId);
      if (parentId && nodeMap.has(parentId)) {
        nodeMap.get(parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  private buildRouteMenuTree(items: SystemMenuEntity[]): MenuNode[] {
    const nodeMap = new Map<string, MenuNode>();
    const roots: MenuNode[] = [];
    const sorted = [...items].sort((left, right) =>
      left.sort - right.sort
      || left.createdAt.toISOString().localeCompare(right.createdAt.toISOString()),
    );
    for (const item of sorted) {
      const node = this.toRouteMenuNode(item);
      nodeMap.set(item.id, node);
    }
    for (const item of sorted) {
      const node = nodeMap.get(item.id)!;
      const parentId = item.parentId?.trim();
      if (parentId && nodeMap.has(parentId)) {
        nodeMap.get(parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  private toRouteMenuNode(entity: SystemMenuEntity): MenuNode {
    const extra = entity.extraJson ?? {};
    const routePath = normalizeRoutePath(entity.routePath);
    const component = normalizeRouteComponent(entity);
    return {
      id: entity.id,
      code: entity.code,
      name: entity.code,
      title: entity.name,
      path: routePath,
      component,
      redirect: pickString(extra.redirect) ?? null,
      parentId: entity.parentId ?? null,
      menuType: entity.menuType,
      visible: entity.visible,
      sort: entity.sort,
      status: entity.status,
      children: [],
      meta: {
        title: entity.name,
        icon: entity.icon ?? null,
        order: entity.sort,
        hideInMenu: !entity.visible,
        hidden: !entity.visible,
        keepAlive: entity.keepAlive,
        permissionCode: entity.permissionCode ?? null,
        link: entity.externalLink ?? null,
        externalLink: entity.externalLink ?? null,
        menuType: entity.menuType,
        activePath: pickString(extra.activePath) ?? null,
        badge: pickString(extra.badge) ?? null,
        badgeType: pickString(extra.badgeType) ?? null,
        affixTab: pickBoolean(extra.affixTab, false),
        menuVisibleWithForbidden: pickBoolean(extra.menuVisibleWithForbidden, false),
        authority: Array.isArray(extra.authority) ? extra.authority : undefined,
      },
    };
  }
}

function resolveTargetTenantId(
  targetTenantId: string | null,
  tenantScope?: string | null,
): string | null {
  if (!tenantScope) {
    return targetTenantId;
  }
  if (targetTenantId && targetTenantId !== tenantScope) {
    throw new Error('tenantId mismatch');
  }
  return tenantScope;
}

function normalizeRoutePath(path?: null | string): string {
  if (!path || !path.trim()) {
    return '/';
  }
  return path.startsWith('/') ? path : `/${path}`;
}

function normalizeRouteComponent(entity: SystemMenuEntity): string {
  if (entity.externalLink) {
    return 'IFrameView';
  }
  if (entity.menuType === 'catalog') {
    return 'BasicLayout';
  }
  if (entity.component?.trim()) {
    return entity.component.startsWith('/') ? entity.component : `/${entity.component}`;
  }
  return 'BasicLayout';
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function pickNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }
  return fallback;
}

function pickObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function pickStringArray(...values: unknown[]): string[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value
        .map((item) => pickString(item))
        .filter((item): item is string => Boolean(item));
    }
  }
  return [];
}

function resolveAuditActor(payload: Record<string, unknown>) {
  return {
    operatorId: pickString(payload.operatorId) ?? 'system',
    operatorName:
      pickString(payload.operatorName)
      ?? pickString(payload.operatorNickname)
      ?? pickString(payload.operatorId)
      ?? 'system',
  };
}
