import { setTimeout as delay } from 'node:timers/promises';
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { getEnvNumber, getEnvString, resolveConfiguredIotReceiveMode, resolveConfiguredIotVendor } from '@lumimax/config';
import { IotIngressAdapterRegistry } from '@lumimax/iot-kit';
import { AppLogger } from '@lumimax/logger';
import { SqsConsumerService } from '@lumimax/mq';
import { IotUplinkBridgeService } from '../../transport/iot-uplink-bridge.service';
import { resolveIotBridgeEventPattern } from '../../transport/iot-bridge.rabbitmq';

@Injectable()
export class AwsSqsIngress implements OnModuleInit, OnApplicationShutdown {
  private running = false;

  constructor(
    @Inject(AppLogger) private readonly logger: AppLogger,
    @Inject(SqsConsumerService) private readonly sqsConsumerService: SqsConsumerService,
    @Inject(IotUplinkBridgeService)
    private readonly iotUplinkBridgeService: IotUplinkBridgeService,
    @Inject(IotIngressAdapterRegistry)
    private readonly iotIngressAdapterRegistry: IotIngressAdapterRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    const vendor = resolveConfiguredIotVendor();
    if (vendor !== 'aws') {
      return;
    }
    const receiveMode = resolveConfiguredIotReceiveMode();
    if (receiveMode !== 'mq') {
      this.logger.log(
        'AWS SQS ingress 未启用',
        { receiveMode, suppressRequestContext: true },
        AwsSqsIngress.name,
      );
      return;
    }
    const queueUrl = getEnvString('AWS_SQS_QUEUE_URL', '') || '';
    if (!queueUrl) {
      this.logger.warn(
        'AWS SQS ingress 已启用，但队列地址为空',
        { suppressRequestContext: true },
        AwsSqsIngress.name,
      );
      return;
    }

    this.running = true;
    this.logger.log(
      `AWS SQS ingress 启动 queue=${summarizeQueueUrl(queueUrl)}`,
      { suppressRequestContext: true },
      AwsSqsIngress.name,
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
          'AWS SQS ingress 轮询失败',
          {
            reason: error instanceof Error ? error.message : String(error),
            queueUrl,
            suppressRequestContext: true,
          },
          AwsSqsIngress.name,
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
    const parsed = this.iotIngressAdapterRegistry.getOrThrow('aws', 'queue').normalize({
      channel: 'queue',
      body: envelope.body,
    });
    const requestId = parsed.requestId ?? envelope.requestId ?? envelope.messageId;
    try {
      await this.iotUplinkBridgeService.bridgeUplink({
        vendor: parsed.vendor,
        topic: parsed.topic,
        payload: parsed.payload,
        receivedAt: parsed.receivedAt,
        requestId,
      }, {
        eventName: resolveIotBridgeEventPattern(parsed.topic),
        transport: 'mqtt',
        meta: {
          ingress: 'aws-sqs',
          messageId: envelope.messageId,
        },
      });
      if (envelope.receiptHandle) {
        await this.sqsConsumerService.ack(queueUrl, envelope.receiptHandle);
      }
    } catch (error) {
      this.logger.error(
        'AWS SQS ingress 消息处理失败',
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
        AwsSqsIngress.name,
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
