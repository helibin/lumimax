import { setTimeout as delay } from 'node:timers/promises';
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { getEnvNumber, getEnvString, resolveConfiguredIotVendor } from '@lumimax/config';
import { AppLogger } from '@lumimax/logger';
import { SqsConsumerService } from '@lumimax/mq';
import { IotIngestService } from '../../events/iot-ingest.service';

@Injectable()
export class AwsIotSqsConsumer implements OnModuleInit, OnApplicationShutdown {
  private running = false;

  constructor(
    @Inject(AppLogger) private readonly logger: AppLogger,
    @Inject(SqsConsumerService) private readonly sqsConsumerService: SqsConsumerService,
    @Inject(IotIngestService) private readonly iotIngestService: IotIngestService,
  ) {}

  async onModuleInit(): Promise<void> {
    const receiveMode = getEnvString('IOT_RECEIVE_MODE', 'queue')!.trim().toLowerCase();
    if (receiveMode !== 'queue') {
      this.logger.log(
        'AWS IoT SQS 消费器未启用',
        { receiveMode, suppressRequestContext: true },
        AwsIotSqsConsumer.name,
      );
      return;
    }

    const queueUrl = getEnvString('IOT_QUEUE_URL', '') || '';
    if (!queueUrl) {
      this.logger.warn(
        'AWS IoT SQS 消费器已启用，但队列地址为空',
        { suppressRequestContext: true },
        AwsIotSqsConsumer.name,
      );
      return;
    }

    this.running = true;
    this.logger.log(
      `AWS IoT SQS 消费器启动 queue=${summarizeQueueUrl(queueUrl)}`,
      { suppressRequestContext: true },
      AwsIotSqsConsumer.name,
    );
    void this.pollLoop(queueUrl);
  }

  onApplicationShutdown(): void {
    this.running = false;
  }

  private async pollLoop(queueUrl: string): Promise<void> {
    const waitTimeSeconds = getEnvNumber('IOT_QUEUE_WAIT_TIME_SECONDS', 10);
    const visibilityTimeout = getEnvNumber('IOT_QUEUE_VISIBILITY_TIMEOUT', 60);
    const batchSize = getEnvNumber('IOT_QUEUE_BATCH_SIZE', 5);
    const idleDelayMs = getEnvNumber('IOT_QUEUE_IDLE_DELAY_MS', 1000);

    while (this.running) {
      try {
        const envelopes = await this.sqsConsumerService.poll<unknown>({
          queueUrl,
          waitTimeSeconds,
          visibilityTimeout,
          batchSize,
        });

        if (envelopes.length === 0) {
          await delay(idleDelayMs);
          continue;
        }

        for (const envelope of envelopes) {
          await this.handleEnvelope(queueUrl, envelope);
        }
      } catch (error) {
        this.logger.error(
          'AWS IoT SQS 轮询失败',
          {
            reason: error instanceof Error ? error.message : String(error),
            queueUrl,
            suppressRequestContext: true,
          },
          AwsIotSqsConsumer.name,
        );
        await delay(Math.max(idleDelayMs, 2000));
      }
    }
  }

  private async handleEnvelope(
    queueUrl: string,
    envelope: {
      messageId: string;
      receiptHandle?: string;
      requestId?: string;
      body: unknown;
    },
  ): Promise<void> {
    const parsed = unwrapSqsIotMessage(envelope.body);
    const requestId = parsed.requestId ?? envelope.requestId ?? envelope.messageId;
    try {
      const result = await this.iotIngestService.ingestCloudMessage({
        vendor: resolveConfiguredIotVendor(),
        topic: parsed.topic,
        payload: parsed.payload,
        receivedAt: parsed.receivedAt,
        requestId,
      });

      if (envelope.receiptHandle) {
        await this.sqsConsumerService.ack(queueUrl, envelope.receiptHandle);
      }
      const normalized = result.normalized;
      const duplicate = result.result?.duplicate ?? false;
      const logMeta = {
        requestId: normalized.requestId,
        idLabel: 'ReqId' as const,
        messageId: envelope.messageId,
        deviceId: normalized.deviceId,
        topic: normalized.topic,
        topicKind: normalized.topicKind,
        event: normalized.event,
        duplicate,
      };
      if (!duplicate) {
        this.logger.debug('AWS IoT SQS 消息确认完成', logMeta, AwsIotSqsConsumer.name);
      }
    } catch (error) {
      this.logger.error(
        'AWS IoT SQS 消息处理失败',
        {
          requestId,
          idLabel: 'ReqId',
          messageId: envelope.messageId,
          topic: parsed.topic,
          vendor: resolveConfiguredIotVendor(),
          retry: true,
          acked: false,
          reason: error instanceof Error ? error.message : String(error),
          rawMessage: envelope.body,
        },
        AwsIotSqsConsumer.name,
      );
    }
  }
}

function unwrapSqsIotMessage(body: unknown): {
  vendor: 'aws' | 'aliyun';
  topic: string;
  payload: Record<string, unknown>;
  requestId?: string;
  receivedAt?: number;
} {
  const root = asRecord(body);
  const nested = unwrapNestedRecord(root);
  const topic =
    pickString(nested.topic)
    || pickString(nested.mqttTopic)
    || pickString(nested['topicName'])
    || '';
  const payloadSource =
    nested.payload
    ?? nested.message
    ?? nested.Message
    ?? nested.data
    ?? root.payload
    ?? root.message;
  const payload = decodePayload(payloadSource);
  const vendor = pickString(nested.vendor) === 'aliyun' ? 'aliyun' : 'aws';
  const requestId =
    pickString(root.requestId)
    || pickString(nested.requestId)
    || pickString(asRecord(payload.meta).requestId);
  const receivedAt =
    pickNumber(root.timestamp)
    ?? pickNumber(nested.timestamp)
    ?? pickNumber(asRecord(payload.meta).timestamp);

  if (!topic) {
    throw new Error('AWS IoT SQS message missing topic');
  }
  return { vendor, topic, payload, requestId, receivedAt };
}
function unwrapNestedRecord(record: Record<string, unknown>): Record<string, unknown> {
  const body = record.body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  const message = record.Message;
  if (typeof message === 'string') {
    try {
      const parsed = JSON.parse(message) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return record;
    }
  }
  return record;
}

function decodePayload(source: unknown): Record<string, unknown> {
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    return source as Record<string, unknown>;
  }
  if (typeof source === 'string' && source.trim()) {
    try {
      const parsed = JSON.parse(source) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return { raw: source };
    }
  }
  return {};
}

function summarizeQueueUrl(queueUrl: string): string {
  try {
    const url = new URL(queueUrl);
    const name = url.pathname.split('/').filter(Boolean).pop();
    return name || queueUrl;
  } catch {
    return queueUrl;
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

function pickNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
