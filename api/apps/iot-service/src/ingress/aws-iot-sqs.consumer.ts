import { setTimeout as delay } from 'node:timers/promises';
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { getEnvNumber, getEnvString, resolveConfiguredIotReceiveMode, resolveConfiguredIotVendor } from '@lumimax/config';
import { IotIngressAdapterRegistry } from '@lumimax/iot-kit';
import { AppLogger } from '@lumimax/logger';
import { SqsConsumerService } from '@lumimax/mq';
import { IotIngestService } from '../pipeline/iot-ingest.service';

@Injectable()
export class AwsIotSqsConsumer implements OnModuleInit, OnApplicationShutdown {
  private running = false;

  constructor(
    @Inject(AppLogger) private readonly logger: AppLogger,
    @Inject(SqsConsumerService) private readonly sqsConsumerService: SqsConsumerService,
    @Inject(IotIngestService) private readonly iotIngestService: IotIngestService,
    @Inject(IotIngressAdapterRegistry)
    private readonly iotIngressAdapterRegistry: IotIngressAdapterRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    const vendor = resolveConfiguredIotVendor();
    if (vendor !== 'aws') {
      this.logger.log(
        'AWS IoT SQS 消费器未启用',
        { vendor, suppressRequestContext: true },
        AwsIotSqsConsumer.name,
      );
      return;
    }

    const receiveMode = resolveConfiguredIotReceiveMode();
    if (receiveMode !== 'mq') {
      this.logger.log(
        'AWS IoT SQS 消费器未启用',
        { receiveMode, suppressRequestContext: true },
        AwsIotSqsConsumer.name,
      );
      return;
    }

    const queueUrl = getEnvString('AWS_SQS_QUEUE_URL', '') || '';
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
    const waitTimeSeconds = getEnvNumber('AWS_SQS_WAIT_TIME_SECONDS', 10);
    const visibilityTimeout = getEnvNumber('AWS_SQS_VISIBILITY_TIMEOUT', 60);
    const batchSize = getEnvNumber('AWS_SQS_BATCH_SIZE', 5);
    const idleDelayMs = getEnvNumber('AWS_SQS_IDLE_DELAY_MS', 1000);

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
    const vendor = resolveConfiguredIotVendor();
    const parsed = this.iotIngressAdapterRegistry.getOrThrow(vendor, 'queue').normalize({
      channel: 'queue',
      body: envelope.body,
    });
    const requestId = parsed.requestId ?? envelope.requestId ?? envelope.messageId;
    try {
      const result = await this.iotIngestService.ingestCloudMessage({
        vendor: parsed.vendor,
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
          vendor: parsed.vendor,
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

function summarizeQueueUrl(queueUrl: string): string {
  try {
    const url = new URL(queueUrl);
    const name = url.pathname.split('/').filter(Boolean).pop();
    return name || queueUrl;
  } catch {
    return queueUrl;
  }
}
