import { Controller, Inject } from '@nestjs/common';
import { normalizeIotVendor } from '@lumimax/config';
import { AppLogger } from '@lumimax/logger';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import type { CloudIotVendorName } from '../iot.types';
import { DownlinkDispatchService } from '../pipeline/downlink-dispatch.service';
import { TopicParserService } from '../pipeline/topic-parser.service';
import type { IotBridgeDownlinkCommandMessage } from '../transport/iot-bridge.rabbitmq';
import { IOT_BRIDGE_DOWNSTREAM_PUBLISH_EVENT } from '../transport/iot-bridge.rabbitmq';
import { IotDownlinkService } from '../transport/iot-downlink.service';

const DOWNSTREAM_RETRY_DELAYS_MS = [
  1_000,
  1_000,
  5_000,
  10_000,
  15_000,
  30_000,
  30_000,
  60_000,
  300_000,
] as const;

const DOWNSTREAM_MAX_BACKOFF_ROUNDS = DOWNSTREAM_RETRY_DELAYS_MS.length;

@Controller()
export class DownstreamConsumer {
  constructor(
    @Inject(TopicParserService)
    private readonly topicParserService: TopicParserService,
    @Inject(IotDownlinkService)
    private readonly iotDownlinkService: IotDownlinkService,
    @Inject(DownlinkDispatchService)
    private readonly downlinkDispatchService: DownlinkDispatchService,
    @Inject(AppLogger)
    private readonly logger: AppLogger,
  ) {}

  @EventPattern(IOT_BRIDGE_DOWNSTREAM_PUBLISH_EVENT)
  async handleDownstream(
    @Payload() payload: IotBridgeDownlinkCommandMessage,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    try {
      if (await this.skipAlreadyFinalized(payload, context)) {
        return;
      }
      this.validatePayload(payload);
      const vendor = await this.downlinkDispatchService.dispatch(payload);
      await this.iotDownlinkService.markPublishedById(payload.messageId, {
        provider: vendor,
        topic: payload.topic,
      });
      this.ack(context);
    } catch (error) {
      const downstreamError = toDownstreamError(error);
      await this.handleFailure(payload, downstreamError);
      const retry = await this.resolveRetryDecision(payload, downstreamError);
      if (!retry.requeue && !(downstreamError instanceof PermanentDownstreamError)) {
        await this.iotDownlinkService.markFailedById(
          payload.messageId,
          { message: downstreamError instanceof Error ? downstreamError.message : String(downstreamError) },
          'dead',
        );
      }
      if (retry.delayMs > 0) {
        await delay(retry.delayMs);
      }
      this.nack(context, retry.requeue);
    }
  }

  private async skipAlreadyFinalized(
    payload: IotBridgeDownlinkCommandMessage,
    context: RmqContext,
  ): Promise<boolean> {
    const entity = await this.iotDownlinkService.findOutboxMessageById(payload.messageId);
    if (!entity || !['published', 'dead'].includes(entity.status)) {
      return false;
    }
    this.logger.debug(
      'IoT 下行消息已是终态，跳过重复投递',
      {
        requestId: payload.requestId,
        idLabel: 'ReqId',
        messageId: payload.messageId,
        topic: payload.topic,
        status: entity.status,
      },
      DownstreamConsumer.name,
    );
    this.ack(context);
    return true;
  }

  private validatePayload(payload: IotBridgeDownlinkCommandMessage): void {
    if (payload.direction !== 'down') {
      throw new PermanentDownstreamError(`unsupported direction: ${payload.direction}`);
    }
    if (!payload.messageId?.trim()) {
      throw new PermanentDownstreamError('messageId is required');
    }
    if (!payload.deviceId?.trim()) {
      throw new PermanentDownstreamError('deviceId is required');
    }
    if (!payload.topic?.trim()) {
      throw new PermanentDownstreamError('topic is required');
    }
    const parsed = this.topicParserService.parse(payload.topic);
    if (parsed.deviceId !== payload.deviceId.trim().toLowerCase()) {
      throw new PermanentDownstreamError(
        `topic deviceId mismatch: topic=${parsed.deviceId}, payload=${payload.deviceId}`,
      );
    }
  }

  private async handleFailure(
    payload: IotBridgeDownlinkCommandMessage,
    error: unknown,
  ): Promise<void> {
    const details = { message: error instanceof Error ? error.message : String(error) };
    if (error instanceof PermanentDownstreamError) {
      await this.iotDownlinkService.markFailedById(payload.messageId, details, 'dead');
      this.logger.warn(
        'IoT 下行消息已标记为 dead',
        {
          requestId: payload.requestId,
          idLabel: 'ReqId',
          messageId: payload.messageId,
          topic: payload.topic,
          reason: details.message,
        },
        DownstreamConsumer.name,
      );
      return;
    }
    await this.iotDownlinkService.markFailedById(payload.messageId, details, 'failed');
    const entity = await this.iotDownlinkService.findOutboxMessageById(payload.messageId);
    const retryCount = Number(entity?.retryCount ?? 0);
    const nextDelayMs = resolveDownstreamRetryDelayMs(retryCount);
    const warnMessage =
      nextDelayMs !== undefined
        ? `IoT 下行消息发布失败，准备第 ${retryCount}/${DOWNSTREAM_MAX_BACKOFF_ROUNDS} 次重试`
        : `IoT 下行消息发布失败，已达退避重试上限（${DOWNSTREAM_MAX_BACKOFF_ROUNDS} 轮），第 ${retryCount} 次失败后不再重试`;
    this.logger.warn(
      warnMessage,
      {
        requestId: payload.requestId,
        idLabel: 'ReqId',
        messageId: payload.messageId,
        topic: payload.topic,
        retryCount,
        maxBackoffRounds: DOWNSTREAM_MAX_BACKOFF_ROUNDS,
        ...(nextDelayMs !== undefined ? { nextRetryDelayMs: nextDelayMs } : {}),
        reason: details.message,
      },
      DownstreamConsumer.name,
    );
  }

  private async resolveRetryDecision(
    payload: IotBridgeDownlinkCommandMessage,
    error: unknown,
  ): Promise<{ requeue: boolean; delayMs: number }> {
    if (error instanceof PermanentDownstreamError) {
      return { requeue: false, delayMs: 0 };
    }
    const entity = await this.iotDownlinkService.findOutboxMessageById(payload.messageId);
    const retries = Number(entity?.retryCount ?? 0);
    const delayMs = resolveDownstreamRetryDelayMs(retries);
    return { requeue: delayMs !== undefined, delayMs: delayMs ?? 0 };
  }

  private ack(context: RmqContext): void {
    context.getChannelRef().ack(context.getMessage());
  }

  private nack(context: RmqContext, requeue: boolean): void {
    context.getChannelRef().nack(context.getMessage(), false, requeue);
  }
}

class PermanentDownstreamError extends Error {}

function toDownstreamError(error: unknown): unknown {
  const message = error instanceof Error ? error.message : String(error);
  if (isPermanentProviderConfigurationError(message)) {
    return new PermanentDownstreamError(message);
  }
  if (message.startsWith('device not found:')) {
    return new PermanentDownstreamError(message);
  }
  return error;
}

function isPermanentProviderConfigurationError(message: string): boolean {
  return message.includes('EMQX REST publish requires IOT_ACCESS_KEY_ID/IOT_ACCESS_KEY_SECRET');
}

function resolveRequestedProvider(payload: IotBridgeDownlinkCommandMessage, deviceProvider: string | undefined): CloudIotVendorName {
  if (payload.provider !== 'auto') {
    return normalizeIotVendor(payload.provider);
  }
  if (!deviceProvider?.trim()) {
    throw new PermanentDownstreamError(`device provider is missing for ${payload.deviceId}`);
  }
  return normalizeIotVendor(deviceProvider);
}

function resolveDownstreamRetryDelayMs(retryCount: number): number | undefined {
  const index = Math.max(0, retryCount - 1);
  return DOWNSTREAM_RETRY_DELAYS_MS[index];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
