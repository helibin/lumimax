import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '@lumimax/logger';
import { RabbitMQService } from '@lumimax/mq';
import {
  type CloudIotVendorName,
} from '../iot.types';
import type { NormalizedIotMessage } from '../domain/normalized-iot-message';
import {
  IOT_BIZ_UPLINK_RECEIVED_EVENT,
  resolveBizEventsQueueName,
} from '../transport/iot-bridge.rabbitmq';
import { IotMessageRegistryService } from './iot-message-registry.service';
import { IotNormalizerService } from './iot-normalizer.service';

@Injectable()
export class IotIngestService {
  constructor(
    @Inject(AppLogger) private readonly logger: AppLogger,
    @Inject(IotNormalizerService)
    private readonly iotNormalizerService: IotNormalizerService,
    @Inject(IotMessageRegistryService)
    private readonly iotMessageRegistryService: IotMessageRegistryService,
    @Inject(RabbitMQService)
    private readonly rabbitmqService: RabbitMQService,
  ) {}

  async ingestCloudMessage(input: {
    vendor: CloudIotVendorName;
    topic: string;
    payload: Record<string, unknown>;
    receivedAt?: number;
    requestId?: string;
  }): Promise<IngestResult> {
    const normalized = this.iotNormalizerService.normalize({
      vendor: input.vendor,
      topic: input.topic,
      payload: input.payload,
      receivedAt: input.receivedAt,
    });
    return this.forwardNormalizedMessage(normalized, { shouldRecord: true });
  }

  async ingestNormalizedMessage(normalized: NormalizedIotMessage): Promise<IngestResult> {
    return this.forwardNormalizedMessage(normalized, { shouldRecord: false });
  }

  private async forwardNormalizedMessage(
    normalized: NormalizedIotMessage,
    options: { shouldRecord: boolean },
  ): Promise<IngestResult> {
    const recorded = options.shouldRecord
      ? await this.iotMessageRegistryService.recordReceived(normalized)
      : undefined;

    if (!options.shouldRecord) {
      const claim = await this.iotMessageRegistryService.claimHandling(normalized.requestId);
      if (!claim.claimed) {
        return {
          success: true,
          message: 'duplicate skipped',
          result: {
            accepted: true,
            duplicate: true,
            skipped: true,
            requestId: normalized.requestId,
            previousStatus: claim.status ?? null,
          },
          normalized: summarizeNormalized(normalized),
        };
      }
    }

    if (recorded?.duplicate && isDuplicateUplinkStatus(recorded.entity.status)) {
      this.logger.debug(
        'IoT ingress skipped duplicate uplink',
        {
          suppressRequestContext: true,
          messageKey: recorded.entity.messageKey,
          topic: normalized.topic,
          previousStatus: recorded.entity.status,
        },
        IotIngestService.name,
      );
      return {
        success: true,
        message: 'duplicate skipped',
        result: {
          accepted: true,
          duplicate: true,
          skipped: true,
          requestId: normalized.requestId,
        },
        normalized: summarizeNormalized(normalized),
      };
    }

    await this.rabbitmqService.emitEvent(
      IOT_BIZ_UPLINK_RECEIVED_EVENT,
      toBizEvent(normalized),
      {
        requestId: normalized.requestId,
        source: 'iot-service',
        queue: resolveBizEventsQueueName(),
      },
    );
    await this.iotMessageRegistryService.markQueued(normalized.requestId, {
      forwardedTo: IOT_BIZ_UPLINK_RECEIVED_EVENT,
      source: 'iot-service',
    });

    return {
      success: true,
      message: 'queued',
      result: {
        accepted: true,
        queued: true,
        requestId: normalized.requestId,
      },
      normalized: summarizeNormalized(normalized),
    };
  }
}

type IngestResult = {
  success: boolean;
  message: string;
  result: Record<string, unknown>;
  normalized: Record<string, unknown>;
};

function summarizeNormalized(normalized: NormalizedIotMessage): Record<string, unknown> {
  return {
    requestId: normalized.requestId,
    vendor: normalized.vendor,
    deviceId: normalized.deviceId,
    topic: normalized.topic,
    topicKind: normalized.topicKind,
    event: normalized.event,
    locale: normalized.locale,
    timestamp: normalized.timestamp,
    receivedAt: normalized.receivedAt.toISOString(),
  };
}

function toBizEvent(normalized: NormalizedIotMessage): Record<string, unknown> {
  return {
    vendor: normalized.vendor,
    topic: normalized.topic,
    deviceId: normalized.deviceId,
    topicKind: normalized.topicKind,
    requestId: normalized.requestId,
    event: normalized.event,
    locale: normalized.locale,
    payload: normalized.payload,
    timestamp: normalized.timestamp,
    receivedAt: normalized.receivedAt.toISOString(),
  };
}

function isDuplicateUplinkStatus(status: string | undefined): boolean {
  return ['received', 'queued', 'processing', 'handled', 'skipped'].includes(String(status ?? ''));
}
