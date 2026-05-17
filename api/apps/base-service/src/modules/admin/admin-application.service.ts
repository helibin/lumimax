import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { parseFacadeJsonObject } from '../shared/base-facade.util';
import type { Repository } from 'typeorm';
import { Brackets, In, MoreThanOrEqual } from 'typeorm';
import {
  SystemAdminEntity,
  SystemAdminRoleEntity,
  SystemPermissionEntity,
  SystemRoleEntity,
  SystemRolePermissionEntity,
} from '../system/entities/system.entities';
import { UserEntity, UserType } from '../user/user.entities';
import { PasswordHashService } from './password-hash.service';
import {
  normalizeKeyword,
  normalizePage,
  toIsoString,
  toPagination,
  type AdminProfileView,
} from './admin.types';
import { AuditLogApplicationService } from '../audit-log/audit-log-application.service';
import { SystemInitService } from './system-init.service';

const LEGACY_DEV_ADMIN_SEED_HASH =
  'scrypt$lumimax-dev-admin$d9147f29fa1c492977126355753d70ef9b2ffcebbe7cb2fc8d5509ec481cd273e3d3e2028c451d62303762350f4c5ee2aaa5e0e4e98cac51a2dfbc50a646bfb4';
const LEGACY_DEV_ADMIN_PASSWORD_MD5 = 'e10adc3949ba59abbe56e057f20f883e';

@Injectable()
export class AdminApplicationService {
  constructor(
    @Inject(PasswordHashService) private readonly passwordHashService: PasswordHashService,
    @Inject(SystemInitService) private readonly systemInitService: SystemInitService,
    @Inject(AuditLogApplicationService)
    private readonly auditLogApplicationService: AuditLogApplicationService,
    @InjectRepository(SystemAdminEntity)
    private readonly adminRepository: Repository<SystemAdminEntity>,
    @InjectRepository(SystemRoleEntity)
    private readonly roleRepository: Repository<SystemRoleEntity>,
    @InjectRepository(SystemAdminRoleEntity)
    private readonly adminRoleRepository: Repository<SystemAdminRoleEntity>,
    @InjectRepository(SystemPermissionEntity)
    private readonly permissionRepository: Repository<SystemPermissionEntity>,
    @InjectRepository(SystemRolePermissionEntity)
    private readonly rolePermissionRepository: Repository<SystemRolePermissionEntity>,
  ) {}

  async dispatch(input: {
    requestId: string;
    service: 'auth' | 'accounts' | 'dashboard';
    method: string;
    payloadJson?: string;
    tenantScope?: string;
  }): Promise<Record<string, unknown>> {
    const payload = parseFacadeJsonObject(input.payloadJson);
    const tenantId = input.tenantScope?.trim() || undefined;
    switch (`${input.service}.${input.method}`) {
      case 'auth.Login':
        return this.login(payload, input.requestId, tenantId);
      case 'auth.GetInitStatus':
        return this.systemInitService.getStatus();
      case 'auth.InitializeSystem':
        return this.systemInitService.initialize({
          username: pickString(payload.username) ?? '',
          password: pickString(payload.password) ?? '',
          nickname: pickString(payload.nickname) ?? '',
          email: pickString(payload.email),
          usageMode: pickString(payload.usageMode) ?? pickString(payload.usage_mode),
        });
      case 'auth.GetMe':
        return this.getMe(payload, tenantId);
      case 'auth.ValidateSession':
        return this.validateSession(payload, tenantId);
      case 'accounts.ListAdminUsers':
        return this.listAdminUsers(payload, tenantId);
      case 'accounts.GetAdminUser':
        return this.getAdminUser(payload, tenantId);
      case 'accounts.CreateAdminUser':
        return this.createAdminUser(payload, input.requestId, tenantId);
      case 'accounts.UpdateAdminUser':
        return this.updateAdminUser(payload, input.requestId, tenantId);
      case 'accounts.UpdateAdminUserStatus':
        return this.updateAdminUserStatus(payload, input.requestId, tenantId);
      case 'accounts.ResetAdminUserPassword':
        await this.resetAdminUserPassword(payload, input.requestId, tenantId);
        return {};
      case 'dashboard.GetOverview':
        return this.getDashboardOverview(tenantId);
      default:
        throw new Error(`Unsupported admin method: ${input.service}.${input.method}`);
    }
  }

  private async getDashboardOverview(tenantId?: string): Promise<Record<string, unknown>> {
    const todayStartAt = new Date();
    todayStartAt.setHours(0, 0, 0, 0);

    const [todayNewUsers, userTotal, activeUserTotal, adminUserTotal, roleTotal, permissionTotal] =
      await Promise.all([
        this.adminRepository.manager.count(UserEntity, {
          where: {
            type: UserType.CUSTOMER,
            createdAt: MoreThanOrEqual(todayStartAt),
            ...(tenantId ? { tenantId } : {}),
          },
        }),
        this.adminRepository.manager.count(UserEntity, {
          where: { type: UserType.CUSTOMER, ...(tenantId ? { tenantId } : {}) },
        }),
        this.adminRepository.manager.count(UserEntity, {
          where: {
            type: UserType.CUSTOMER,
            status: 'ACTIVE',
            ...(tenantId ? { tenantId } : {}),
          },
        }),
        this.adminRepository.count(tenantId ? { where: { tenantId } } : {}),
        this.roleRepository.count(tenantId ? { where: { tenantId } } : {}),
        this.permissionRepository.count(tenantId ? { where: { tenantId } } : {}),
      ]);

    return {
      todayNewUsers,
      userTotal,
      activeUserTotal,
      adminUserTotal,
      roleTotal,
      permissionTotal,
      permissionServiceStatus: 'ok',
      systemServiceStatus: 'ok',
    };
  }

  private async login(
    payload: Record<string, unknown>,
    requestId: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const username = pickString(payload.username);
    const password = pickString(payload.password);
    if (!username || !password) {
      throw new BadRequestException('username and password are required');
    }
    const admin = await this.adminRepository.findOne({
      where: tenantId ? { username, tenantId } : { username },
    });
    if (!admin) {
      throw new UnauthorizedException('invalid admin credentials');
    }
    if (admin.status !== 'active') {
      throw new ForbiddenException('admin user disabled');
    }
    const verified = await this.passwordHashService.verifyClientPasswordMd5(
      password,
      admin.passwordHash,
      admin.id,
    );
    if (!verified && !this.matchesLegacyDevSeedPassword(admin.passwordHash, password)) {
      throw new UnauthorizedException('invalid admin credentials');
    }
    if (!verified && this.matchesLegacyDevSeedPassword(admin.passwordHash, password)) {
      // Backfill once: migrate legacy fixed-id dev seed hash to current id strategy.
      admin.passwordHash = await this.passwordHashService.hashClientPasswordMd5(password, admin.id);
    }
    admin.lastLoginAt = new Date();
    await this.adminRepository.save(admin);
    return {
      access_token: '',
      user: await this.buildAdminProfile(admin, tenantId),
    };
  }

  private async getMe(
    payload: Record<string, unknown>,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const adminId = pickString(payload.admin_id) ?? pickString(payload.adminId);
    if (!adminId) {
      throw new BadRequestException('admin id is required');
    }
    const admin = await this.mustGetActiveAdmin(adminId, tenantId);
    return {
      user: await this.buildAdminProfile(admin, tenantId),
    };
  }

  private async validateSession(
    payload: Record<string, unknown>,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const adminId = pickString(payload.admin_id) ?? pickString(payload.adminId);
    if (!adminId) {
      throw new BadRequestException('admin id is required');
    }
    await this.mustGetActiveAdmin(adminId, tenantId);
    return { ok: true };
  }

  private async listAdminUsers(
    payload: Record<string, unknown>,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const { page, pageSize, skip } = normalizePage({
      page: pickNumber(payload.page) ?? pickNumber(payload.page_size),
      pageSize: pickNumber(payload.pageSize) ?? pickNumber(payload.page_size),
    });
    const keyword = normalizeKeyword(pickString(payload.keyword));
    const status = normalizeKeyword(pickString(payload.status));
    const qb = this.adminRepository.createQueryBuilder('admin').where('admin.deleted_at IS NULL');
    if (tenantId) {
      qb.andWhere('admin.tenant_id = :tenantId', { tenantId });
    }
    if (keyword) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('admin.username ILIKE :keyword', { keyword: `%${keyword}%` })
            .orWhere('admin.nickname ILIKE :keyword', { keyword: `%${keyword}%` })
            .orWhere('admin.email ILIKE :keyword', { keyword: `%${keyword}%` })
            .orWhere('admin.phone ILIKE :keyword', { keyword: `%${keyword}%` });
        }),
      );
    }
    if (status) {
      qb.andWhere('admin.status = :status', { status });
    }
    qb.orderBy('admin.created_at', 'DESC').skip(skip).take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    const mapped = await Promise.all(items.map((item) => this.mapAdminUser(item, tenantId)));
    return {
      items: mapped,
      pagination: {
        ...toPagination(page, pageSize, total),
      },
    };
  }

  private async getAdminUser(
    payload: Record<string, unknown>,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const id = pickString(payload.id);
    if (!id) {
      throw new Error('admin user id is required');
    }
    const admin = await this.mustGetAdmin(id, tenantId);
    return this.mapAdminUser(admin, tenantId);
  }

  private async createAdminUser(
    payload: Record<string, unknown>,
    requestId: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const username = pickString(payload.username);
    const password = pickString(payload.password);
    const nickname = pickString(payload.nickname);
    if (!username || !password || !nickname) {
      throw new Error('username, password and nickname are required');
    }
    const targetTenantId = resolveTargetTenantId(pickString(payload.tenantId) ?? null, tenantId ?? null);
    const existed = await this.adminRepository.findOne({
      where: targetTenantId ? { username, tenantId: targetTenantId } : { username },
    });
    if (existed) {
      throw new Error('admin username already exists');
    }
    const roleIds = await this.ensureRoleIds(pickStringArray(payload.role_ids, payload.roleIds), targetTenantId ?? undefined);
    const entity = await this.adminRepository.save(
      this.adminRepository.create({
        username,
        passwordHash: await this.passwordHashService.hashClientPasswordMd5(password, 'pending'),
        nickname,
        email: pickString(payload.email) ?? null,
        phone: pickString(payload.phone) ?? null,
        status: 'active',
        tenantId: targetTenantId,
      }),
    );
    entity.passwordHash = await this.passwordHashService.hashClientPasswordMd5(password, entity.id);
    await this.adminRepository.save(entity);
    await this.replaceRoles(entity.id, roleIds, requestId, targetTenantId ?? undefined);
    await this.auditLogApplicationService.dispatch({
      requestId,
      tenantScope: targetTenantId ?? undefined,
      method: 'CreateAuditLog',
      payloadJson: JSON.stringify({
        operatorId: pickString(payload.operatorId) ?? entity.id,
        operatorName: pickString(payload.operatorName) ?? entity.username,
        action: 'admin-user.create',
        resourceType: 'system_admin',
        resourceId: entity.id,
        after: {
          username: entity.username,
          roleIds,
        },
      }),
    });
    return this.mapAdminUser(entity, targetTenantId ?? undefined);
  }

  private async updateAdminUser(
    payload: Record<string, unknown>,
    requestId: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const id = pickString(payload.id);
    if (!id) {
      throw new Error('admin user id is required');
    }
    const admin = await this.mustGetAdmin(id, tenantId);
    const roleIds = await this.ensureRoleIds(
      pickStringArray(payload.role_ids, payload.roleIds),
      admin.tenantId ?? tenantId,
    );
    const before = await this.mapAdminUser(admin, admin.tenantId ?? tenantId);
    admin.nickname = pickString(payload.nickname) ?? admin.nickname;
    admin.email = pickString(payload.email) ?? null;
    admin.phone = pickString(payload.phone) ?? null;
    await this.adminRepository.save(admin);
    await this.replaceRoles(admin.id, roleIds, requestId, admin.tenantId ?? tenantId);
    const after = await this.mapAdminUser(admin, admin.tenantId ?? tenantId);
    await this.auditLogApplicationService.dispatch({
      requestId,
      tenantScope: admin.tenantId ?? tenantId,
      method: 'CreateAuditLog',
      payloadJson: JSON.stringify({
        operatorId: pickString(payload.operatorId) ?? admin.id,
        operatorName: pickString(payload.operatorName) ?? admin.username,
        action: 'admin-user.update',
        resourceType: 'system_admin',
        resourceId: admin.id,
        before,
        after,
      }),
    });
    return after;
  }

  private async updateAdminUserStatus(
    payload: Record<string, unknown>,
    requestId: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const id = pickString(payload.id);
    const status = pickString(payload.status);
    if (!id || !status) {
      throw new Error('admin user id and status are required');
    }
    const admin = await this.mustGetAdmin(id, tenantId);
    const before = await this.mapAdminUser(admin, admin.tenantId ?? tenantId);
    admin.status = status === 'disabled' ? 'disabled' : 'active';
    await this.adminRepository.save(admin);
    const after = await this.mapAdminUser(admin, admin.tenantId ?? tenantId);
    await this.auditLogApplicationService.dispatch({
      requestId,
      tenantScope: admin.tenantId ?? tenantId,
      method: 'CreateAuditLog',
      payloadJson: JSON.stringify({
        operatorId: pickString(payload.operatorId) ?? admin.id,
        operatorName: pickString(payload.operatorName) ?? admin.username,
        action: 'admin-user.status',
        resourceType: 'system_admin',
        resourceId: admin.id,
        before,
        after,
      }),
    });
    return after;
  }

  private async resetAdminUserPassword(
    payload: Record<string, unknown>,
    requestId: string,
    tenantId?: string,
  ): Promise<void> {
    const id = pickString(payload.id);
    const newPassword =
      pickString(payload.new_password) ?? pickString(payload.newPassword);
    if (!id || !newPassword) {
      throw new Error('admin user id and new password are required');
    }
    const admin = await this.mustGetAdmin(id, tenantId);
    admin.passwordHash = await this.passwordHashService.hashClientPasswordMd5(
      newPassword,
      admin.id,
    );
    await this.adminRepository.save(admin);
    await this.auditLogApplicationService.dispatch({
      requestId,
      tenantScope: admin.tenantId ?? tenantId,
      method: 'CreateAuditLog',
      payloadJson: JSON.stringify({
        operatorId: pickString(payload.operatorId) ?? admin.id,
        operatorName: pickString(payload.operatorName) ?? admin.username,
        action: 'admin-user.password.reset',
        resourceType: 'system_admin',
        resourceId: admin.id,
      }),
    });
  }

  private async mustGetAdmin(id: string, tenantId?: string): Promise<SystemAdminEntity> {
    const admin = await this.adminRepository.findOne({
      where: tenantId ? { id, tenantId } : { id },
    });
    if (!admin) {
      throw new Error(`admin user not found: ${id}`);
    }
    return admin;
  }

  private async mustGetActiveAdmin(id: string, tenantId?: string): Promise<SystemAdminEntity> {
    const admin = await this.adminRepository.findOne({
      where: tenantId ? { id, tenantId } : { id },
    });
    if (!admin) {
      throw new UnauthorizedException('admin session expired');
    }
    if (admin.status !== 'active') {
      throw new UnauthorizedException('admin account disabled');
    }
    return admin;
  }

  private async ensureRoleIds(roleIds: string[], tenantId?: string): Promise<string[]> {
    const deduped = Array.from(new Set(roleIds.filter(Boolean)));
    if (deduped.length === 0) {
      return [];
    }
    const roles = await this.roleRepository.find({
      where: tenantId ? { id: In(deduped), tenantId } : { id: In(deduped) },
    });
    if (roles.length !== deduped.length) {
      throw new Error('role not found');
    }
    return deduped;
  }

  private async replaceRoles(
    adminId: string,
    roleIds: string[],
    requestId: string,
    tenantId?: string,
  ): Promise<void> {
    await this.adminRoleRepository.delete(tenantId ? { adminId, tenantId } : { adminId });
    if (roleIds.length === 0) {
      return;
    }
    await this.adminRoleRepository.save(
      roleIds.map((roleId) =>
        this.adminRoleRepository.create({
          adminId,
          roleId,
          tenantId: tenantId ?? null,
        }),
      ),
    );
  }

  private async buildAdminProfile(
    admin: SystemAdminEntity,
    tenantId?: string,
  ): Promise<AdminProfileView> {
    const roles = await this.getRoleCodesByAdminId(admin.id, tenantId);
    const permissions = await this.getPermissionsByAdminId(admin.id, tenantId);
    if (isSuperAdminRole(roles) && !permissions.includes('*')) {
      permissions.unshift('*');
    }
    return {
      id: admin.id,
      username: admin.username,
      nickname: admin.nickname,
      email: admin.email ?? '',
      phone: admin.phone ?? '',
      status: admin.status,
      roles,
      permissions,
      lastLoginAt: toIsoString(admin.lastLoginAt),
    };
  }

  private async mapAdminUser(
    admin: SystemAdminEntity,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const roleRows = await this.roleRepository.query(
      `SELECT r.name
         FROM system_roles r
         INNER JOIN system_admin_roles ar ON ar.role_id = r.id
        WHERE ar.admin_id = $1
          AND r.deleted_at IS NULL
          ${tenantId ? 'AND ar.tenant_id = $2 AND r.tenant_id = $2' : ''}
        ORDER BY r.name ASC`,
      tenantId ? [admin.id, tenantId] : [admin.id],
    );
    return {
      id: admin.id,
      username: admin.username,
      nickname: admin.nickname,
      email: admin.email ?? '',
      phone: admin.phone ?? '',
      status: admin.status,
      tenantId: admin.tenantId ?? null,
      roles: roleRows.map((item: { name: string }) => item.name),
      last_login_at: toIsoString(admin.lastLoginAt),
      created_at: toIsoString(admin.createdAt),
      updated_at: toIsoString(admin.updatedAt),
    };
  }

  private async getRoleCodesByAdminId(adminId: string, tenantId?: string): Promise<string[]> {
    const roleRows = await this.roleRepository.query(
      `SELECT r.code
         FROM system_roles r
         INNER JOIN system_admin_roles ar ON ar.role_id = r.id
        WHERE ar.admin_id = $1
          AND r.deleted_at IS NULL
          ${tenantId ? 'AND ar.tenant_id = $2 AND r.tenant_id = $2' : ''}
          AND r.status = 'active'`,
      tenantId ? [adminId, tenantId] : [adminId],
    );
    return roleRows.map((item: { code: string }) => item.code);
  }

  private async getPermissionsByAdminId(adminId: string, tenantId?: string): Promise<string[]> {
    const rows = await this.permissionRepository.query(
      `SELECT DISTINCT p.code
         FROM system_permissions p
         INNER JOIN system_role_permissions rp ON rp.permission_id = p.id
         INNER JOIN system_admin_roles ar ON ar.role_id = rp.role_id
         INNER JOIN system_roles r ON r.id = ar.role_id
        WHERE ar.admin_id = $1
          AND r.deleted_at IS NULL
          ${tenantId ? 'AND ar.tenant_id = $2 AND rp.tenant_id = $2 AND p.tenant_id = $2 AND r.tenant_id = $2' : ''}
          AND r.status = 'active'
        ORDER BY p.code ASC`,
      tenantId ? [adminId, tenantId] : [adminId],
    );
    return rows.map((item: { code: string }) => item.code);
  }

  private matchesLegacyDevSeedPassword(
    passwordHash: string,
    passwordMd5: string,
  ): boolean {
    return (
      passwordHash === LEGACY_DEV_ADMIN_SEED_HASH
      && passwordMd5.trim().toLowerCase() === LEGACY_DEV_ADMIN_PASSWORD_MD5
    );
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

function isSuperAdminRole(roleCodes: string[]): boolean {
  const candidates = new Set([
    'super-admin',
    'super_admin',
    'superadmin',
    'super',
    'root',
    'admin',
    'administrator',
    'system-admin',
    'system_admin',
  ]);
  return roleCodes.some((code) => candidates.has(code.toLowerCase()));
}
