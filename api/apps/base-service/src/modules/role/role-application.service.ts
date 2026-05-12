import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { toUtcIso } from '@lumimax/http-kit';
import type { Repository } from 'typeorm';
import { In } from 'typeorm';
import { AuditLogApplicationService } from '../audit-log/audit-log-application.service';
import {
  SystemPermissionEntity,
  SystemRoleEntity,
  SystemRolePermissionEntity,
} from '../system/entities/system.entities';
import { parseFacadeJsonObject } from '../shared/base-facade.util';

@Injectable()
export class RoleApplicationService {
  constructor(
    @InjectRepository(SystemRoleEntity)
    private readonly roleRepository: Repository<SystemRoleEntity>,
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
      case 'ListRoles':
        return this.listRoles(payload, tenantId);
      case 'GetRole':
        return this.getRole(payload, tenantId);
      case 'CreateRole':
        return this.createRole(payload, input.requestId, tenantId);
      case 'UpdateRole':
        return this.updateRole(payload, input.requestId, tenantId);
      case 'UpdateRoleStatus':
        return this.updateRoleStatus(payload, input.requestId, tenantId);
      case 'UpdateRolePermissions':
        return this.updateRolePermissions(payload, input.requestId, tenantId);
      default:
        throw new Error(`Unsupported role method: ${input.method}`);
    }
  }

  private async listRoles(
    payload: Record<string, unknown>,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const page = Math.max(1, Number(payload.page ?? 1));
    const pageSize = Math.max(1, Number(payload.pageSize ?? 20));
    const keyword = String(payload.keyword ?? '').trim();
    const qb = this.roleRepository
      .createQueryBuilder('role')
      .orderBy('role.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (tenantId) {
      qb.andWhere('role.tenant_id = :tenantId', { tenantId });
    }
    if (keyword) {
      qb.andWhere('(role.code ILIKE :keyword OR role.name ILIKE :keyword)', {
        keyword: `%${keyword}%`,
      });
    }
    const [items, total] = await qb.getManyAndCount();
    const permissionsByRoleId = await this.getPermissionsByRoleIds(items.map((item) => item.id), tenantId);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
      items: items.map((item) => this.toRole(item, permissionsByRoleId.get(item.id) ?? [])),
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }

  private async getRole(
    payload: Record<string, unknown>,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const id = pickString(payload.id);
    if (!id) {
      throw new Error('role id is required');
    }
    const role = await this.roleRepository.findOne({ where: roleWhere(id, tenantId) });
    if (!role) {
      throw new Error(`role not found: ${id}`);
    }
    const permissionsByRoleId = await this.getPermissionsByRoleIds([role.id], tenantId);
    return this.toRole(role, permissionsByRoleId.get(role.id) ?? []);
  }

  private async createRole(
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
      throw new Error('role code and name are required');
    }
    const role = await this.roleRepository.save(
      this.roleRepository.create({
        code,
        name,
        description: pickString(payload.description) ?? null,
        status: pickString(payload.status) ?? 'active',
        tenantId: targetTenantId,
      }),
    );
    await this.writeAuditLog(payload, requestId, targetTenantId ?? undefined, {
      action: 'system-role.create',
      resourceId: role.id,
      after: this.toRole(role, []),
    });
    return this.toRole(role, []);
  }

  private async updateRole(
    payload: Record<string, unknown>,
    requestId: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const id = pickString(payload.id);
    if (!id) {
      throw new Error('role id is required');
    }
    const role = await this.roleRepository.findOne({ where: roleWhere(id, tenantId) });
    if (!role) {
      throw new Error(`role not found: ${id}`);
    }
    const before = this.toRole(role, await this.loadRolePermissions(role.id, tenantId));
    role.code = pickString(payload.code) ?? role.code;
    role.name = pickString(payload.name) ?? role.name;
    role.description = pickString(payload.description) ?? role.description;
    const saved = await this.roleRepository.save(role);
    const permissionsByRoleId = await this.getPermissionsByRoleIds([saved.id], tenantId);
    const result = this.toRole(saved, permissionsByRoleId.get(saved.id) ?? []);
    await this.writeAuditLog(payload, requestId, saved.tenantId ?? tenantId, {
      action: 'system-role.update',
      resourceId: saved.id,
      before,
      after: result,
    });
    return result;
  }

  private async updateRoleStatus(
    payload: Record<string, unknown>,
    requestId: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const id = pickString(payload.id);
    const status = pickString(payload.status);
    if (!id || !status) {
      throw new Error('role id and status are required');
    }
    const role = await this.roleRepository.findOne({ where: roleWhere(id, tenantId) });
    if (!role) {
      throw new Error(`role not found: ${id}`);
    }
    const before = this.toRole(role, await this.loadRolePermissions(role.id, tenantId));
    role.status = status;
    const saved = await this.roleRepository.save(role);
    const permissionsByRoleId = await this.getPermissionsByRoleIds([saved.id], tenantId);
    const result = this.toRole(saved, permissionsByRoleId.get(saved.id) ?? []);
    await this.writeAuditLog(payload, requestId, saved.tenantId ?? tenantId, {
      action: 'system-role.status',
      resourceId: saved.id,
      before,
      after: result,
    });
    return result;
  }

  private async updateRolePermissions(
    payload: Record<string, unknown>,
    requestId: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const roleId = pickString(payload.id) ?? pickString(payload.role_id) ?? pickString(payload.roleId);
    const permissionIds = pickStringArray(
      payload.permissionIds,
      payload.permission_ids,
    );
    if (!roleId) {
      throw new Error('role id is required');
    }
    const role = await this.roleRepository.findOne({ where: roleWhere(roleId, tenantId) });
    if (!role) {
      throw new Error(`role not found: ${roleId}`);
    }
    const dedupedPermissionIds = Array.from(new Set(permissionIds));
    if (dedupedPermissionIds.length > 0) {
      const permissions = await this.permissionRepository.find({
        where: tenantId
          ? { id: In(dedupedPermissionIds), tenantId }
          : { id: In(dedupedPermissionIds) },
      });
      if (permissions.length !== dedupedPermissionIds.length) {
        throw new Error('permission not found');
      }
    }

    const before = this.toRole(role, await this.loadRolePermissions(roleId, tenantId));
    await this.rolePermissionRepository.delete(tenantId ? { roleId, tenantId } : { roleId });
    if (dedupedPermissionIds.length > 0) {
      await this.rolePermissionRepository.save(
        dedupedPermissionIds.map((permissionId) =>
          this.rolePermissionRepository.create({
            permissionId,
            roleId,
            tenantId: role.tenantId ?? tenantId ?? null,
          }),
        ),
      );
    }

    const permissionsByRoleId = await this.getPermissionsByRoleIds([roleId], tenantId);
    const result = this.toRole(role, permissionsByRoleId.get(roleId) ?? []);
    await this.writeAuditLog(payload, requestId, role.tenantId ?? tenantId, {
      action: 'system-role.permissions.update',
      resourceId: roleId,
      before,
      after: result,
    });
    return result;
  }

  private async loadRolePermissions(roleId: string, tenantId?: string) {
    const permissionsByRoleId = await this.getPermissionsByRoleIds([roleId], tenantId);
    return permissionsByRoleId.get(roleId) ?? [];
  }

  private async getPermissionsByRoleIds(roleIds: string[], tenantId?: string) {
    const dedupedRoleIds = Array.from(new Set(roleIds.filter(Boolean)));
    const mapped = new Map<string, Array<Record<string, unknown>>>();
    if (dedupedRoleIds.length === 0) {
      return mapped;
    }

    const rows = await this.rolePermissionRepository
      .createQueryBuilder('rp')
      .innerJoin(SystemPermissionEntity, 'permission', 'permission.id = rp.permission_id')
      .select([
        'rp.role_id AS "roleId"',
        'permission.id AS "id"',
        'permission.code AS "code"',
        'permission.name AS "name"',
        'permission.group_code AS "groupCode"',
        'permission.description AS "description"',
      ])
      .where('rp.role_id IN (:...roleIds)', { roleIds: dedupedRoleIds })
      .andWhere(tenantId ? 'rp.tenant_id = :tenantId' : '1=1', tenantId ? { tenantId } : {})
      .andWhere(tenantId ? 'permission.tenant_id = :tenantId' : '1=1', tenantId ? { tenantId } : {})
      .orderBy('permission.group_code', 'ASC')
      .addOrderBy('permission.code', 'ASC')
      .getRawMany<{
        code: string;
        description: null | string;
        groupCode: string;
        id: string;
        name: string;
        roleId: string;
      }>();

    for (const row of rows) {
      const bucket = mapped.get(row.roleId) ?? [];
      bucket.push({
        code: row.code,
        description: row.description,
        groupCode: row.groupCode,
        id: row.id,
        name: row.name,
      });
      mapped.set(row.roleId, bucket);
    }
    return mapped;
  }

  private toRole(
    role: SystemRoleEntity,
    permissions: Array<Record<string, unknown>>,
  ): Record<string, unknown> {
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description ?? null,
      permissions,
      status: role.status,
      createdAt: toUtcIso(role.createdAt),
      updatedAt: toUtcIso(role.updatedAt),
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
        resourceType: 'system_role',
        resourceId: input.resourceId ?? null,
        before: input.before ?? null,
        after: input.after ?? null,
      }),
    });
  }
}

function roleWhere(id: string, tenantId?: string) {
  return tenantId ? { id, tenantId } : { id };
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

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function pickStringArray(...values: unknown[]): string[] {
  for (const value of values) {
    if (!Array.isArray(value)) {
      continue;
    }
    return value.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );
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
