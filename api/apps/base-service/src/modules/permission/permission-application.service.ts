import { Injectable } from '@nestjs/common';
import { toUtcIso } from '@lumimax/http-kit';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { SystemPermissionEntity } from '../system/entities/system.entities';
import { parseFacadeJsonObject } from '../shared/base-facade.util';

@Injectable()
export class PermissionApplicationService {
  constructor(
    @InjectRepository(SystemPermissionEntity)
    private readonly permissionRepository: Repository<SystemPermissionEntity>,
  ) {}

  async dispatch(input: {
    requestId: string;
    method: string;
    payloadJson?: string;
    tenantScope?: string;
  }): Promise<Record<string, unknown>> {
    const payload = parseFacadeJsonObject(input.payloadJson);
    if (input.method !== 'ListPermissions') {
      throw new Error(`Unsupported permission method: ${input.method}`);
    }
    const keyword = String(payload.keyword ?? '').trim().toLowerCase();
    const tenantId = input.tenantScope?.trim() || undefined;
    const permissions = await this.permissionRepository.find(
      tenantId
        ? { where: { tenantId }, order: { groupCode: 'ASC', code: 'ASC' } }
        : { order: { groupCode: 'ASC', code: 'ASC' } },
    );
    const filtered = keyword
      ? permissions.filter((item) =>
          [item.code, item.name, item.groupCode, item.description ?? '']
            .join(' ')
            .toLowerCase()
            .includes(keyword),
        )
      : permissions;
    return {
      items: filtered.map((item) => ({
        id: item.id,
        code: item.code,
        name: item.name,
        groupCode: item.groupCode,
        description: item.description ?? null,
        createdAt: toUtcIso(item.createdAt),
        updatedAt: toUtcIso(item.updatedAt),
      })),
      pagination: {
        page: 1,
        pageSize: filtered.length || 1,
        total: filtered.length,
        totalPages: 1,
        hasMore: false,
      },
    };
  }
}
