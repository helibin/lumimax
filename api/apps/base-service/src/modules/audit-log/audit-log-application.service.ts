import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Brackets } from 'typeorm';
import { SystemAuditLogEntity } from '../system/entities/system.entities';
import { parseFacadeJsonObject } from '../shared/base-facade.util';

@Injectable()
export class AuditLogApplicationService {
  constructor(
    @InjectRepository(SystemAuditLogEntity)
    private readonly auditLogRepository: Repository<SystemAuditLogEntity>,
  ) {}

  async dispatch(input: {
    requestId: string;
    method: string;
    payloadJson?: string;
    tenantScope?: string;
  }): Promise<Record<string, unknown>> {
    const payload = parseFacadeJsonObject(input.payloadJson);
    switch (input.method) {
      case 'ListAuditLogs':
        return this.listAuditLogs(payload, input.tenantScope?.trim() || undefined);
      case 'CreateAuditLog':
        return this.createAuditLog(payload, input.requestId, input.tenantScope?.trim() || undefined);
      default:
        throw new Error(`Unsupported audit log method: ${input.method}`);
    }
  }

  private async listAuditLogs(
    payload: Record<string, unknown>,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const page = Math.max(1, Number(payload.page ?? 1));
    const pageSize = Math.max(1, Number(payload.pageSize ?? 20));
    const keyword = String(payload.keyword ?? '').trim();
    const resourceType = String(payload.resource_type ?? payload.resourceType ?? '').trim();
    const action = String(payload.action ?? '').trim();
    const startAt = pickDate(payload.start_at ?? payload.startAt);
    const endAt = pickDate(payload.end_at ?? payload.endAt);
    const qb = this.auditLogRepository
      .createQueryBuilder('audit')
      .orderBy('audit.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (tenantId) {
      qb.andWhere('audit.tenant_id = :tenantId', { tenantId });
    }
    if (keyword) {
      qb.andWhere(new Brackets((subQb) => {
        subQb.where('audit.action ILIKE :keyword', { keyword: `%${keyword}%` })
          .orWhere('audit.resourceType ILIKE :keyword', { keyword: `%${keyword}%` })
          .orWhere('audit.operatorName ILIKE :keyword', { keyword: `%${keyword}%` })
          .orWhere('audit.operatorId ILIKE :keyword', { keyword: `%${keyword}%` })
          .orWhere('audit.requestId ILIKE :keyword', { keyword: `%${keyword}%` })
          .orWhere('audit.resourceId ILIKE :keyword', { keyword: `%${keyword}%` });
      }));
    }
    if (resourceType) {
      qb.andWhere('audit.resourceType = :resourceType', { resourceType });
    }
    if (action) {
      qb.andWhere('audit.action = :action', { action });
    }
    if (startAt) {
      qb.andWhere('audit.createdAt >= :startAt', { startAt: startAt.toISOString() });
    }
    if (endAt) {
      qb.andWhere('audit.createdAt <= :endAt', { endAt: endAt.toISOString() });
    }
    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
      items: items.map((item) => this.toAuditLog(item)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }

  private async createAuditLog(
    payload: Record<string, unknown>,
    requestId: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const operatorId = pickString(payload.operatorId) ?? 'system';
    const operatorName = pickString(payload.operatorName) ?? 'system';
    const action = pickString(payload.action);
    const resourceType = pickString(payload.resourceType);
    if (!action || !resourceType) {
      throw new Error('audit log action and resourceType are required');
    }
    const entity = await this.auditLogRepository.save(
      this.auditLogRepository.create({
        operatorId,
        operatorName,
        action,
        resourceType,
        resourceId: pickString(payload.resourceId) ?? null,
        beforeJson: asObject(payload.before) ?? null,
        afterJson: asObject(payload.after) ?? null,
        tenantId: resolveTargetTenantId(pickString(payload.tenantId) ?? null, tenantId ?? null),
      }),
    );
    return this.toAuditLog(entity);
  }

  private toAuditLog(entity: SystemAuditLogEntity): Record<string, unknown> {
    return {
      id: entity.id,
      operatorId: entity.operatorId,
      operatorName: entity.operatorName,
      action: entity.action,
      resourceType: entity.resourceType,
      resourceId: entity.resourceId ?? null,
      before: entity.beforeJson ?? null,
      after: entity.afterJson ?? null,
      createdAt: entity.createdAt.toISOString(),
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

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function pickDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
