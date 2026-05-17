import crypto from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { QueryFailedError } from 'typeorm';
import { DeviceEntity, IotMessageEntity } from '../common/entities/biz.entities';
import type { BizIotTopicKind } from '../iot.types';
import { type CloudIotVendorName } from '../iot.types';
import { TopicParserService } from '../pipeline/topic-parser.service';
import { resolveTenantId } from '../common/tenant-scope.util';
import { shouldQueueDownlinkThroughBridge } from './iot-bridge.rabbitmq';
import type { IotDownlinkPort } from './iot-downlink.port';
import type { IotMessagePublisherPort } from './iot-message-publisher.port';
import { IOT_MESSAGE_PUBLISHER } from './iot-message-publisher.port';

@Injectable()
export class IotDownlinkService implements IotDownlinkPort {
  constructor(
    @InjectRepository(IotMessageEntity)
    private readonly iotMessageRepository: Repository<IotMessageEntity>,
    @InjectRepository(DeviceEntity)
    private readonly deviceRepository: Repository<DeviceEntity>,
    @Inject(TopicParserService) private readonly topicParserService: TopicParserService,
    @Inject(IOT_MESSAGE_PUBLISHER)
    private readonly iotMessagePublisher?: IotMessagePublisherPort,
  ) {}

  async publish(input: {
    vendor: CloudIotVendorName;
    deviceId: string;
    topicKind: BizIotTopicKind;
    payload: Record<string, unknown>;
    requestId: string;
    tenantId?: string;
    qos?: 0 | 1;
    transport?: 'direct' | 'bridge';
  }): Promise<{ topic: string; requestId: string; delivery: 'queued' | 'sent' }> {
    const topic = this.topicParserService.build(input.topicKind, input.deviceId);
    const device = await this.findDevice(input.deviceId);
    const event = pickString(asRecord(input.payload.meta).event) ?? 'unknown';
    const entity = await this.recordDownlinkMessage({
      device,
      deviceId: input.deviceId,
      requestId: input.requestId,
      tenantId: input.tenantId,
      topic,
      payload: input.payload,
      status: 'pending',
    });
    if (
      input.transport === 'direct'
      || !shouldQueueDownlinkThroughBridge(input.vendor)
      || !this.iotMessagePublisher?.isEnabled()
    ) {
      await this.markPublishedById(entity.id, {
        via: 'direct-bypass',
        vendor: input.vendor,
      });
      return { topic, requestId: input.requestId, delivery: 'sent' };
    }

    try {
      await this.iotMessagePublisher!.publishDownlinkCommand({
        direction: 'down',
        provider: 'auto',
        messageId: entity.id,
        deviceId: input.deviceId,
        topic,
        event,
        payload: input.payload,
        requestId: input.requestId,
        tenantId: input.tenantId,
        qos: input.qos,
        retain: false,
        trace: {
          outboxMessageId: entity.id,
          messageKey: entity.messageKey,
        },
      });
      await this.markQueuedById(entity.id, {
        provider: 'auto',
        qos: input.qos ?? 1,
        retain: false,
      });
      return { topic, requestId: input.requestId, delivery: 'queued' };
    } catch (error) {
      await this.markFailedById(entity.id, {
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async publishConnectionFeedback(input: {
    vendor: CloudIotVendorName;
    deviceId: string;
    topicKind: BizIotTopicKind;
    payload: Record<string, unknown>;
    requestId: string;
    reason: string;
    tenantId?: string;
    qos?: 0 | 1;
  }): Promise<{ topic: string; requestId: string; delivery: 'sent'; supported: boolean }> {
    const topic = this.topicParserService.build(input.topicKind, input.deviceId);
    const device = await this.findDevice(input.deviceId);
    const entity = await this.recordDownlinkMessage({
      device,
      deviceId: input.deviceId,
      requestId: input.requestId,
      tenantId: input.tenantId,
      topic,
      payload: input.payload,
      status: 'pending',
    });
    if (!this.iotMessagePublisher?.isEnabled()) {
      await this.markPublishedById(entity.id, {
        via: 'direct-bypass',
        reason: input.reason,
      });
      return {
        topic,
        requestId: input.requestId,
        delivery: 'sent',
        supported: true,
      };
    }
    await this.iotMessagePublisher.publishDownlinkCommand({
      direction: 'down',
      provider: 'auto',
      messageId: entity.id,
      deviceId: input.deviceId,
      topic,
      event: pickString(asRecord(input.payload.meta).event) ?? 'unknown',
      payload: input.payload,
      requestId: input.requestId,
      tenantId: input.tenantId,
      qos: input.qos,
      retain: false,
      trace: {
        outboxMessageId: entity.id,
        messageKey: entity.messageKey,
        reason: input.reason,
      },
    });
    await this.markQueuedById(entity.id, {
      provider: 'auto',
      reason: input.reason,
      qos: input.qos ?? 1,
    });
    return {
      topic,
      requestId: input.requestId,
      delivery: 'sent',
      supported: true,
    };
  }

  async markQueuedById(id: string, result: Record<string, unknown>): Promise<void> {
    await this.updateMessageById(id, {
      status: 'queued',
      resultJson: result,
      errorJson: null,
    });
  }

  async markPublishedById(id: string, result: Record<string, unknown>): Promise<void> {
    await this.updateMessageById(id, {
      status: 'published',
      resultJson: result,
      errorJson: null,
    });
  }

  async markFailedById(id: string, error: Record<string, unknown>, status: 'failed' | 'dead' = 'failed'): Promise<void> {
    await this.updateMessageById(id, {
      status,
      errorJson: error,
      retryCountDelta: status === 'failed' ? 1 : undefined,
    });
  }

  async findOutboxMessageById(id: string): Promise<IotMessageEntity | null> {
    return this.iotMessageRepository.findOne({ where: { id } });
  }

  async resolveDeviceByIdOrSn(deviceId: string): Promise<DeviceEntity | null> {
    return this.findDevice(deviceId);
  }

  private async recordDownlinkMessage(input: {
    device?: DeviceEntity | null;
    deviceId: string;
    requestId: string;
    tenantId?: string;
    topic: string;
    payload: Record<string, unknown>;
    status: string;
  }): Promise<IotMessageEntity> {
    const messageKey = buildDownlinkMessageKey(
      pickString(asRecord(input.payload.meta).requestId) ?? input.requestId,
      input.topic,
    );
    try {
      return await this.iotMessageRepository.save(
        this.iotMessageRepository.create({
          tenantId: input.tenantId ?? input.device?.tenantId ?? resolveTenantId(),
          messageKey,
          deviceId: input.deviceId,
          direction: 'downstream',
          topic: input.topic,
          event: pickString(asRecord(input.payload.meta).event) ?? 'unknown',
          status: input.status,
          provider: normalizeProviderName(input.device?.provider),
          retryCount: 0,
          payloadJson: input.payload,
          resultJson: null,
          errorJson: null,
        }),
      );
    } catch (error) {
      if (!isUniqueMessageKeyViolation(error)) {
        throw error;
      }
      const existing = await this.iotMessageRepository.findOne({
        where: { messageKey },
      });
      if (existing) {
        return existing;
      }
    }
    throw new Error(`failed to create iot downlink outbox message: ${messageKey}`);
  }

  private findDevice(deviceId: string): Promise<DeviceEntity | null> {
    return this.deviceRepository.findOne({
      where: [{ id: deviceId }, { deviceSn: deviceId }],
    });
  }

  private async updateMessageById(
    id: string,
    input: {
      status: string;
      resultJson?: Record<string, unknown> | null;
      errorJson?: Record<string, unknown> | null;
      retryCountDelta?: number;
    },
  ): Promise<void> {
    const entity = await this.iotMessageRepository.findOne({ where: { id } });
    if (!entity) {
      return;
    }
    entity.status = input.status;
    if (input.resultJson !== undefined) {
      entity.resultJson = input.resultJson;
    }
    if (input.errorJson !== undefined) {
      entity.errorJson = input.errorJson;
    }
    if (input.retryCountDelta) {
      entity.retryCount = Math.max(0, Number(entity.retryCount ?? 0) + input.retryCountDelta);
    }
    await this.iotMessageRepository.save(entity);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function buildDownlinkMessageKey(requestId: string, topic: string): string {
  const normalizedRequestId = requestId.trim();
  const topicDigest = crypto
    .createHash('sha1')
    .update(topic)
    .digest('hex')
    .slice(0, 16);
  return `${normalizedRequestId}:${topicDigest}`;
}

function normalizeProviderName(value: string | undefined): CloudIotVendorName | undefined {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return normalized === 'emqx' ? 'emqx' : 'aws';
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
