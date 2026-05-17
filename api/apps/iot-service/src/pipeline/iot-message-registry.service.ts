import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { QueryFailedError } from 'typeorm';
import { DeviceEntity, IotMessageEntity } from '../common/entities/biz.entities';
import type { NormalizedBizIotMessage } from '../iot.types';
import { resolveTenantId } from '../common/tenant-scope.util';

@Injectable()
export class IotMessageRegistryService {
  constructor(
    @InjectRepository(IotMessageEntity)
    private readonly iotMessageRepository: Repository<IotMessageEntity>,
    @InjectRepository(DeviceEntity)
    private readonly deviceRepository: Repository<DeviceEntity>,
  ) {}

  async recordReceived(message: NormalizedBizIotMessage): Promise<{
    duplicate: boolean;
    entity: IotMessageEntity;
  }> {
    const device = await this.deviceRepository.findOne({
      where: [{ id: message.deviceId }, { deviceSn: message.deviceId }],
    });
    try {
      const entity = await this.iotMessageRepository.save(
        this.iotMessageRepository.create({
          tenantId: device?.tenantId ?? resolveTenantId(),
          messageKey: message.requestId,
          deviceId: message.deviceId,
          direction: message.topicKind.endsWith('.req') ? 'upstream' : 'downstream',
          topic: message.topic,
          event: message.event,
          status: 'received',
          provider: message.vendor,
          retryCount: 0,
          payloadJson: message.payload,
          resultJson: null,
          errorJson: null,
        }),
      );
      return { duplicate: false, entity };
    } catch (error) {
      if (!isUniqueMessageKeyViolation(error)) {
        throw error;
      }
      const entity = await this.iotMessageRepository.findOne({
        where: { messageKey: message.requestId },
        withDeleted: true,
      });
      if (!entity) {
        throw error;
      }
      return { duplicate: true, entity };
    }
  }

  async isHandled(messageKey: string): Promise<boolean> {
    const entity = await this.iotMessageRepository.findOne({
      where: { messageKey },
    });
    return entity?.status === 'handled' || entity?.status === 'skipped';
  }

  async claimHandling(messageKey: string): Promise<{
    claimed: boolean;
    status?: string;
  }> {
    const result = await this.iotMessageRepository
      .createQueryBuilder()
      .update(IotMessageEntity)
      .set({
        status: 'processing',
        errorJson: null,
      })
      .where('message_key = :messageKey', { messageKey })
      .andWhere('status IN (:...statuses)', { statuses: ['received', 'queued', 'failed'] })
      .execute();
    if (Number(result.affected ?? 0) > 0) {
      return { claimed: true, status: 'processing' };
    }
    const entity = await this.iotMessageRepository.findOne({
      where: { messageKey },
      withDeleted: true,
    });
    return { claimed: false, status: entity?.status };
  }

  async markHandled(
    id: string,
    result: Record<string, unknown>,
    status: 'handled' | 'skipped' = 'handled',
  ): Promise<void> {
    const entity = await this.iotMessageRepository.findOne({
      where: { messageKey: id },
    });
    if (!entity) {
      return;
    }
    entity.status = status;
    entity.resultJson = result;
    entity.errorJson = null;
    await this.iotMessageRepository.save(entity);
  }

  async markQueued(id: string, result: Record<string, unknown>): Promise<void> {
    const entity = await this.iotMessageRepository.findOne({
      where: { messageKey: id },
    });
    if (!entity) {
      return;
    }
    entity.status = 'queued';
    entity.resultJson = result;
    entity.errorJson = null;
    await this.iotMessageRepository.save(entity);
  }

  async markFailed(id: string, error: Record<string, unknown>): Promise<void> {
    const entity = await this.iotMessageRepository.findOne({
      where: { messageKey: id },
    });
    if (!entity) {
      return;
    }
    entity.status = 'failed';
    entity.errorJson = error;
    await this.iotMessageRepository.save(entity);
  }

  async list(input: {
    tenantId: string;
    page?: number;
    pageSize?: number;
    keyword?: string;
  }): Promise<{
    items: Array<Record<string, unknown>>;
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  }> {
    const page = Math.max(1, Number(input.page ?? 1));
    const pageSize = Math.max(1, Number(input.pageSize ?? input.page ?? 20));
    const keyword = String(input.keyword ?? '').trim();
    const qb = this.iotMessageRepository
      .createQueryBuilder('message')
      .where('message.tenantId = :tenantId', { tenantId: input.tenantId })
      .orderBy('message.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (keyword) {
      qb.andWhere(
        '(message.messageKey ILIKE :keyword OR message.deviceId ILIKE :keyword OR message.topic ILIKE :keyword OR message.event ILIKE :keyword)',
        { keyword: `%${keyword}%` },
      );
    }

    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      items: items.map((item) => this.toAdminListItem(item)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }

  async get(tenantId: string, id: string): Promise<{ json: string }> {
    const item = await this.iotMessageRepository.findOne({
      where: { tenantId, messageKey: id },
    });
    return {
      json: JSON.stringify(
        item
          ? {
              id: item.messageKey,
              requestId: item.messageKey,
              deviceId: item.deviceId,
              direction: item.direction,
              provider: item.provider,
              topic: item.topic,
              event: item.event,
              status: item.status,
              retryCount: item.retryCount,
              createdAt: item.createdAt.toISOString(),
              payload: item.payloadJson ?? null,
              response: item.resultJson ?? null,
              error: item.errorJson ?? null,
            }
          : {},
      ),
    };
  }

  private toAdminListItem(item: IotMessageEntity): Record<string, unknown> {
    return {
      id: item.messageKey,
      requestId: item.messageKey,
      deviceId: item.deviceId,
      direction: item.direction,
      provider: item.provider,
      topic: item.topic,
      event: item.event,
      status: item.status,
      retryCount: item.retryCount,
      createdAt: item.createdAt.toISOString(),
    };
  }
}

function isUniqueMessageKeyViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError = error.driverError as { code?: string; constraint?: string } | undefined;
  return (
    driverError?.code === '23505'
    && driverError?.constraint === 'iot_messages_message_key_key'
  );
}
