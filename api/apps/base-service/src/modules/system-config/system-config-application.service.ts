import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { toUtcIso } from '@lumimax/http-kit';
import type { Repository } from 'typeorm';
import { AuditLogApplicationService } from '../audit-log/audit-log-application.service';
import { SystemConfigEntity } from '../system/entities/system.entities';
import { parseFacadeJsonObject } from '../shared/base-facade.util';

@Injectable()
export class SystemConfigApplicationService {
  constructor(
    @InjectRepository(SystemConfigEntity)
    private readonly systemConfigRepository: Repository<SystemConfigEntity>,
    @Inject(AuditLogApplicationService)
    private readonly auditLogApplicationService: AuditLogApplicationService,
  ) {}

  async dispatchAdmin(input: {
    requestId: string;
    method: string;
    payloadJson?: string;
    tenantScope?: string;
  }): Promise<Record<string, unknown>> {
    const payload = parseFacadeJsonObject(input.payloadJson);
    const tenantId = input.tenantScope?.trim() || undefined;
    switch (input.method) {
      case 'ListSystemConfigs':
        return this.listConfigs(payload, tenantId);
      case 'CreateSystemConfig':
        return this.createConfig(payload, input.requestId, tenantId);
      case 'UpdateSystemConfig':
        return this.updateConfig(payload, input.requestId, tenantId);
      case 'UpdateSystemConfigStatus':
        return this.updateConfigStatus(payload, input.requestId, tenantId);
      default:
        throw new Error(`Unsupported system config method: ${input.method}`);
    }
  }

  async dispatchPublic(input: {
    requestId: string;
    method: string;
    payloadJson?: string;
    tenantScope?: string;
  }): Promise<Record<string, unknown>> {
    const payload = parseFacadeJsonObject(input.payloadJson);
    const tenantId = input.tenantScope?.trim() || undefined;
    switch (input.method) {
      case 'ListConfigItems':
      case 'ListSystemConfigs':
        return this.listConfigs(payload, tenantId);
      case 'GetConfigItem':
      case 'GetSystemConfig': {
        const key = pickString(payload.configKey) ?? pickString(payload.config_key);
        if (!key) {
          throw new Error('config key is required');
        }
        const entity = await this.systemConfigRepository.findOne({
          where: tenantId ? { configKey: key, tenantId } : { configKey: key },
        });
        if (!entity) {
          throw new Error(`system config not found: ${key}`);
        }
        return this.toConfig(entity);
      }
      default:
        throw new Error(`Unsupported public system config method: ${input.method}`);
    }
  }

  private async listConfigs(
    payload: Record<string, unknown>,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const page = Math.max(1, Number(payload.page ?? payload.page_size ?? 1));
    const pageSize = Math.max(1, Number(payload.pageSize ?? payload.page_size ?? 20));
    const keyword = String(payload.keyword ?? '').trim();
    const qb = this.systemConfigRepository
      .createQueryBuilder('config')
      .orderBy('config.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (tenantId) {
      qb.andWhere('config.tenant_id = :tenantId', { tenantId });
    }
    if (keyword) {
      qb.andWhere(
        '(config.configKey ILIKE :keyword OR config.name ILIKE :keyword OR config.groupCode ILIKE :keyword)',
        { keyword: `%${keyword}%` },
      );
    }
    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
      items: items.map((item) => this.toConfig(item)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }

  private async createConfig(
    payload: Record<string, unknown>,
    requestId: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const targetTenantId = resolveTargetTenantId(
      pickString(payload.tenantId) ?? null,
      tenantId ?? null,
    );
    const configKey = pickString(payload.configKey) ?? pickString(payload.config_key);
    const configValue = pickConfigValue(payload.configValue ?? payload.config_value);
    const valueType = pickString(payload.valueType) ?? pickString(payload.value_type);
    const groupCode = pickString(payload.groupCode) ?? pickString(payload.group_code);
    const name = pickString(payload.name);
    if (!configKey || configValue === undefined || !valueType || !groupCode || !name) {
      throw new Error('configKey, configValue, valueType, groupCode and name are required');
    }
    const entity = await this.systemConfigRepository.save(
      this.systemConfigRepository.create({
        configKey,
        configValue,
        valueType,
        groupCode,
        name,
        description: pickString(payload.description) ?? null,
        isEncrypted: Boolean(payload.isEncrypted ?? payload.is_encrypted ?? false),
        status: pickString(payload.status) ?? 'active',
        tenantId: targetTenantId,
      }),
    );
    await this.writeAuditLog(payload, requestId, targetTenantId ?? undefined, {
      action: 'system-config.create',
      resourceId: entity.id,
      after: this.toConfig(entity),
    });
    return this.toConfig(entity);
  }

  private async updateConfig(
    payload: Record<string, unknown>,
    requestId: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const id = pickString(payload.id);
    if (!id) {
      throw new Error('system config id is required');
    }
    const entity = await this.systemConfigRepository.findOne({
      where: tenantId ? { id, tenantId } : { id },
    });
    if (!entity) {
      throw new Error(`system config not found: ${id}`);
    }
    const before = this.toConfig(entity);
    entity.configKey = pickString(payload.configKey) ?? pickString(payload.config_key) ?? entity.configKey;
    entity.configValue = pickConfigValue(payload.configValue ?? payload.config_value) ?? entity.configValue;
    entity.valueType = pickString(payload.valueType) ?? pickString(payload.value_type) ?? entity.valueType;
    entity.groupCode = pickString(payload.groupCode) ?? pickString(payload.group_code) ?? entity.groupCode;
    entity.name = pickString(payload.name) ?? entity.name;
    entity.description = pickString(payload.description) ?? entity.description;
    if (payload.isEncrypted !== undefined || payload.is_encrypted !== undefined) {
      entity.isEncrypted = Boolean(payload.isEncrypted ?? payload.is_encrypted);
    }
    const saved = await this.systemConfigRepository.save(entity);
    await this.writeAuditLog(payload, requestId, saved.tenantId ?? tenantId, {
      action: 'system-config.update',
      resourceId: saved.id,
      before,
      after: this.toConfig(saved),
    });
    return this.toConfig(saved);
  }

  private async updateConfigStatus(
    payload: Record<string, unknown>,
    requestId: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const id = pickString(payload.id);
    const status = pickString(payload.status);
    if (!id || !status) {
      throw new Error('system config id and status are required');
    }
    const entity = await this.systemConfigRepository.findOne({
      where: tenantId ? { id, tenantId } : { id },
    });
    if (!entity) {
      throw new Error(`system config not found: ${id}`);
    }
    const before = this.toConfig(entity);
    entity.status = status;
    const saved = await this.systemConfigRepository.save(entity);
    await this.writeAuditLog(payload, requestId, saved.tenantId ?? tenantId, {
      action: 'system-config.status',
      resourceId: saved.id,
      before,
      after: this.toConfig(saved),
    });
    return this.toConfig(saved);
  }

  private toConfig(entity: SystemConfigEntity): Record<string, unknown> {
    return {
      id: entity.id,
      configKey: entity.configKey,
      configValue: entity.configValue,
      valueType: entity.valueType,
      groupCode: entity.groupCode,
      name: entity.name,
      description: entity.description ?? null,
      isEncrypted: entity.isEncrypted,
      status: entity.status,
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
        resourceType: 'system_config',
        resourceId: input.resourceId ?? null,
        before: input.before ?? null,
        after: input.after ?? null,
      }),
    });
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

function pickConfigValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value && typeof value === 'object') {
    return JSON.stringify(value);
  }
  return undefined;
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
