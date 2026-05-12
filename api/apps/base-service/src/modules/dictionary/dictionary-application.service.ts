import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { toUtcIso } from '@lumimax/http-kit';
import type { Repository } from 'typeorm';
import { AuditLogApplicationService } from '../audit-log/audit-log-application.service';
import {
  SystemDictionaryEntity,
  SystemDictionaryItemEntity,
} from '../system/entities/system.entities';
import { parseFacadeJsonObject } from '../shared/base-facade.util';

@Injectable()
export class DictionaryApplicationService {
  constructor(
    @InjectRepository(SystemDictionaryEntity)
    private readonly dictionaryRepository: Repository<SystemDictionaryEntity>,
    @InjectRepository(SystemDictionaryItemEntity)
    private readonly dictionaryItemRepository: Repository<SystemDictionaryItemEntity>,
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
      case 'ListDictionaries':
        return this.listDictionaries(payload, tenantId);
      case 'CreateDictionary':
        return this.createDictionary(payload, input.requestId, tenantId);
      case 'UpdateDictionary':
        return this.updateDictionary(payload, input.requestId, tenantId);
      case 'DeleteDictionary':
        return this.deleteDictionary(payload, input.requestId, tenantId);
      case 'ListDictionaryItems':
        return this.listDictionaryItems(payload, tenantId);
      case 'CreateDictionaryItem':
        return this.createDictionaryItem(payload, input.requestId, tenantId);
      case 'UpdateDictionaryItem':
        return this.updateDictionaryItem(payload, input.requestId, tenantId);
      case 'DeleteDictionaryItem':
        return this.deleteDictionaryItem(payload, input.requestId, tenantId);
      default:
        throw new Error(`Unsupported dictionary method: ${input.method}`);
    }
  }

  async dispatchPublic(input: {
    requestId: string;
    method: string;
    payloadJson?: string;
    tenantScope?: string;
  }): Promise<Record<string, unknown>> {
    const payload = parseFacadeJsonObject(input.payloadJson);
    switch (input.method) {
      case 'ListDictionaryItems':
        return this.listDictionaryItems(payload, input.tenantScope?.trim() || undefined);
      default:
        throw new Error(`Unsupported public dictionary method: ${input.method}`);
    }
  }

  private async listDictionaries(
    payload: Record<string, unknown>,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const page = Math.max(1, Number(payload.page ?? payload.page_size ?? 1));
    const pageSize = Math.max(1, Number(payload.pageSize ?? payload.page_size ?? 20));
    const keyword = String(payload.keyword ?? '').trim();
    const qb = this.dictionaryRepository
      .createQueryBuilder('dictionary')
      .orderBy('dictionary.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (tenantId) {
      qb.andWhere('dictionary.tenant_id = :tenantId', { tenantId });
    }
    if (keyword) {
      qb.andWhere('(dictionary.code ILIKE :keyword OR dictionary.name ILIKE :keyword)', {
        keyword: `%${keyword}%`,
      });
    }
    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
      items: items.map((item) => this.toDictionary(item)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }

  private async createDictionary(
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
      throw new Error('dictionary code and name are required');
    }
    const entity = await this.dictionaryRepository.save(
      this.dictionaryRepository.create({
        code,
        name,
        description: pickString(payload.description) ?? null,
        status: pickString(payload.status) ?? 'active',
        tenantId: targetTenantId,
      }),
    );
    await this.writeAuditLog(payload, requestId, targetTenantId ?? undefined, {
      action: 'system-dictionary.create',
      resourceId: entity.id,
      resourceType: 'system_dictionary',
      after: this.toDictionary(entity),
    });
    return this.toDictionary(entity);
  }

  private async updateDictionary(
    payload: Record<string, unknown>,
    requestId: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const code = pickString(payload.code);
    if (!code) {
      throw new Error('dictionary code is required');
    }
    const entity = await this.dictionaryRepository.findOne({
      where: tenantId ? { code, tenantId } : { code },
    });
    if (!entity) {
      throw new Error(`dictionary not found: ${code}`);
    }
    const before = this.toDictionary(entity);
    entity.name = pickString(payload.name) ?? entity.name;
    entity.description = pickString(payload.description) ?? entity.description ?? null;
    const saved = await this.dictionaryRepository.save(entity);
    await this.writeAuditLog(payload, requestId, saved.tenantId ?? tenantId, {
      action: 'system-dictionary.update',
      resourceId: saved.id,
      resourceType: 'system_dictionary',
      before,
      after: this.toDictionary(saved),
    });
    return this.toDictionary(saved);
  }

  private async deleteDictionary(
    payload: Record<string, unknown>,
    requestId: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const code = pickString(payload.code);
    if (!code) {
      throw new Error('dictionary code is required');
    }
    const entity = await this.dictionaryRepository.findOne({
      where: tenantId ? { code, tenantId } : { code },
    });
    if (!entity) {
      throw new Error(`dictionary not found: ${code}`);
    }
    const items = await this.dictionaryItemRepository.count({
      where: tenantId ? { dictionaryCode: code, tenantId } : { dictionaryCode: code },
    });
    if (items > 0) {
      throw new Error(`dictionary still has items: ${code}`);
    }
    const before = this.toDictionary(entity);
    await this.dictionaryRepository.softDelete(entity.id);
    await this.writeAuditLog(payload, requestId, entity.tenantId ?? tenantId, {
      action: 'system-dictionary.delete',
      resourceId: entity.id,
      resourceType: 'system_dictionary',
      before,
      after: { deleted: true, code },
    });
    return { ok: true, code };
  }

  private async listDictionaryItems(
    payload: Record<string, unknown>,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const code = pickString(payload.code) ?? pickString(payload.dictionary_code);
    if (!code) {
      throw new Error('dictionary code is required');
    }
    const items = await this.dictionaryItemRepository.find({
      where: tenantId ? { dictionaryCode: code, tenantId } : { dictionaryCode: code },
      order: { sort: 'ASC', createdAt: 'ASC' },
    });
    return {
      items: items.map((item) => this.toDictionaryItem(item)),
      pagination: {
        page: 1,
        pageSize: items.length || 1,
        total: items.length,
        totalPages: 1,
        hasMore: false,
      },
    };
  }

  private async createDictionaryItem(
    payload: Record<string, unknown>,
    requestId: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const dictionaryCode = pickString(payload.dictionary_code) ?? pickString(payload.dictionaryCode);
    const label = pickString(payload.label);
    const value = pickString(payload.value);
    if (!dictionaryCode || !label || !value) {
      throw new Error('dictionaryCode, label and value are required');
    }
    const targetTenantId = resolveTargetTenantId(
      pickString(payload.tenantId) ?? null,
      tenantId ?? null,
    );
    const entity = await this.dictionaryItemRepository.save(
      this.dictionaryItemRepository.create({
        dictionaryCode,
        label,
        value,
        sort: Number(payload.sort ?? 0),
        status: pickString(payload.status) ?? 'active',
        extraJson: parseJsonRecord(payload.extra_json) ?? asObject(payload.extra) ?? null,
        tenantId: targetTenantId,
      }),
    );
    await this.writeAuditLog(payload, requestId, targetTenantId ?? undefined, {
      action: 'system-dictionary-item.create',
      resourceId: entity.id,
      resourceType: 'system_dictionary_item',
      after: this.toDictionaryItem(entity),
    });
    return this.toDictionaryItem(entity);
  }

  private async updateDictionaryItem(
    payload: Record<string, unknown>,
    requestId: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const id = pickString(payload.id);
    if (!id) {
      throw new Error('dictionary item id is required');
    }
    const entity = await this.dictionaryItemRepository.findOne({
      where: tenantId ? { id, tenantId } : { id },
    });
    if (!entity) {
      throw new Error(`dictionary item not found: ${id}`);
    }
    const before = this.toDictionaryItem(entity);
    entity.label = pickString(payload.label) ?? entity.label;
    entity.value = pickString(payload.value) ?? entity.value;
    entity.sort = Number(payload.sort ?? entity.sort);
    entity.status = pickString(payload.status) ?? entity.status;
    entity.extraJson =
      parseJsonRecord(payload.extra_json)
      ?? asObject(payload.extra)
      ?? entity.extraJson
      ?? null;
    const saved = await this.dictionaryItemRepository.save(entity);
    await this.writeAuditLog(payload, requestId, saved.tenantId ?? tenantId, {
      action: 'system-dictionary-item.update',
      resourceId: saved.id,
      resourceType: 'system_dictionary_item',
      before,
      after: this.toDictionaryItem(saved),
    });
    return this.toDictionaryItem(saved);
  }

  private async deleteDictionaryItem(
    payload: Record<string, unknown>,
    requestId: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const id = pickString(payload.id);
    if (!id) {
      throw new Error('dictionary item id is required');
    }
    const entity = await this.dictionaryItemRepository.findOne({
      where: tenantId ? { id, tenantId } : { id },
    });
    if (!entity) {
      throw new Error(`dictionary item not found: ${id}`);
    }
    const before = this.toDictionaryItem(entity);
    await this.dictionaryItemRepository.softDelete(id);
    await this.writeAuditLog(payload, requestId, entity.tenantId ?? tenantId, {
      action: 'system-dictionary-item.delete',
      resourceId: id,
      resourceType: 'system_dictionary_item',
      before,
      after: { deleted: true, id },
    });
    return { ok: true, id };
  }

  private toDictionary(entity: SystemDictionaryEntity): Record<string, unknown> {
    return {
      id: entity.id,
      code: entity.code,
      name: entity.name,
      description: entity.description ?? null,
      status: entity.status,
      createdAt: toUtcIso(entity.createdAt),
      updatedAt: toUtcIso(entity.updatedAt),
    };
  }

  private toDictionaryItem(entity: SystemDictionaryItemEntity): Record<string, unknown> {
    return {
      id: entity.id,
      dictionaryCode: entity.dictionaryCode,
      label: entity.label,
      value: entity.value,
      sort: entity.sort,
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

function parseJsonRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value);
    return asObject(parsed);
  } catch {
    return undefined;
  }
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
