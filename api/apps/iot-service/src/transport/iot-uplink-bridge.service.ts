import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '@lumimax/logger';
import { RabbitMQConfirmPublisherService } from '@lumimax/mq';
import { IotMessageRegistryService } from '../pipeline/iot-message-registry.service';
import { IotNormalizerService } from '../pipeline/iot-normalizer.service';
import type {
  IotBridgeBizUplinkMessage,
  IotBridgeUplinkMessage,
} from './iot-bridge.rabbitmq';
import {
  IOT_BIZ_UPLINK_RECEIVED_EVENT,
  resolveBizEventsQueueName,
} from './iot-bridge.rabbitmq';

@Injectable()
export class IotUplinkBridgeService {
  constructor(
    @Inject(IotNormalizerService)
    private readonly iotNormalizerService: IotNormalizerService,
    @Inject(IotMessageRegistryService)
    private readonly iotMessageRegistryService: IotMessageRegistryService,
    @Inject(RabbitMQConfirmPublisherService)
    private readonly rabbitmqConfirmPublisherService: RabbitMQConfirmPublisherService,
    @Inject(AppLogger)
    private readonly logger: AppLogger,
  ) {}

  async bridgeUplink(
    payload: IotBridgeUplinkMessage,
    input: {
      eventName: string;
      transport: 'rmq' | 'mqtt';
      meta?: Record<string, unknown>;
    },
  ): Promise<{ duplicated: boolean }> {
    const normalized = this.iotNormalizerService.normalize({
      vendor: payload.vendor,
      topic: payload.topic,
      payload: payload.payload ?? {},
      receivedAt: payload.receivedAt,
    });
    const recorded = await this.iotMessageRegistryService.recordReceived(normalized);
    if (recorded.duplicate && isDuplicateUplinkStatus(recorded.entity.status)) {
      this.logger.debug(
        'IoT bridge 跳过重复上行消息',
        {
          suppressRequestContext: true,
          messageKey: recorded.entity.messageKey,
          topic: normalized.topic,
          eventName: input.eventName,
          transport: input.transport,
          previousStatus: recorded.entity.status,
          ...(input.meta ?? {}),
        },
        IotUplinkBridgeService.name,
      );
      return { duplicated: true };
    }
    await this.rabbitmqConfirmPublisherService.emitEventConfirmed(
      IOT_BIZ_UPLINK_RECEIVED_EVENT,
      this.toBizEvent(normalized),
      {
        requestId: normalized.requestId,
        source: 'iot-bridge',
        queue: resolveBizEventsQueueName(),
      },
    );
    await this.iotMessageRegistryService.markQueued(normalized.requestId, {
      forwardedTo: IOT_BIZ_UPLINK_RECEIVED_EVENT,
      eventName: input.eventName,
      transport: input.transport,
    });
    this.logger.debug(
      'IoT 上行消息已桥接到 biz 队列',
      {
        suppressRequestContext: true,
        messageKey: normalized.requestId,
        requestId: normalized.requestId,
        vendor: normalized.vendor,
        deviceId: normalized.deviceId,
        topic: normalized.topic,
        topicKind: normalized.topicKind,
        event: normalized.event,
        eventName: input.eventName,
        transport: input.transport,
        publish_received_at: payload.receivedAt,
        payload: summarizeLogValue(payload.payload ?? {}),
        ...(input.meta ?? {}),
      },
      IotUplinkBridgeService.name,
    );
    return { duplicated: false };
  }

  private toBizEvent(payload: ReturnType<IotNormalizerService['normalize']>): IotBridgeBizUplinkMessage {
    return {
      vendor: payload.vendor,
      topic: payload.topic,
      deviceId: payload.deviceId,
      topicKind: payload.topicKind,
      requestId: payload.requestId,
      event: payload.event,
      locale: payload.locale,
      payload: payload.payload,
      timestamp: payload.timestamp,
      receivedAt: payload.receivedAt.toISOString(),
    };
  }
}

function isDuplicateUplinkStatus(status: string | undefined): boolean {
  return ['received', 'queued', 'processing', 'handled', 'skipped'].includes(String(status ?? ''));
}

function summarizeLogValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return truncateString(value, 2000);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Buffer.isBuffer(value)) {
    return truncateString(value.toString('utf8'), 2000);
  }
  if (Array.isArray(value)) {
    const sliced = value.slice(0, 20).map((item) => summarizeLogValue(item, depth + 1));
    if (value.length > sliced.length) {
      sliced.push(`...(truncated ${value.length - sliced.length} items)`);
    }
    return sliced;
  }
  if (typeof value === 'object') {
    if (depth >= 5) {
      return '[Object]';
    }
    const entries = Object.entries(value as Record<string, unknown>);
    const output: Record<string, unknown> = {};
    for (const [key, nested] of entries.slice(0, 40)) {
      output[key] = summarizeLogValue(nested, depth + 1);
    }
    if (entries.length > 40) {
      output.__truncatedKeys = entries.length - 40;
    }
    return output;
  }
  return String(value);
}

function truncateString(value: string, maxLength: number): string {
  return value.length > maxLength
    ? `${value.slice(0, maxLength)}...(truncated ${value.length - maxLength} chars)`
    : value;
}
