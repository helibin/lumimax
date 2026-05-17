import { Controller, Inject } from '@nestjs/common';
import { normalizeIotVendor } from '@lumimax/config';
import { AppLogger } from '@lumimax/logger';
import { IotProviderRegistry } from '@lumimax/iot-kit';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import type { CloudIotVendorName } from '../iot.types';
import { TopicParserService } from '../pipeline/topic-parser.service';
import type { IotBridgeDownlinkCommandMessage } from './iot-bridge.rabbitmq';
import {
  IOT_BRIDGE_DOWNSTREAM_PUBLISH_EVENT,
} from './iot-bridge.rabbitmq';
import { IotDownlinkService } from './iot-downlink.service';

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
export class IotDownstreamRabbitmqController {
  constructor(
    @Inject(TopicParserService)
    private readonly topicParserService: TopicParserService,
    @Inject(IotDownlinkService)
    private readonly iotDownlinkService: IotDownlinkService,
    @Inject(IotProviderRegistry)
    private readonly iotProviderRegistry: IotProviderRegistry,
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
      await this.publishToProvider(payload);
      await this.iotDownlinkService.markPublishedById(payload.messageId, {
        provider: await this.resolveProviderName(payload),
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
      if (!retry.requeue) {
        return;
      }
      return;
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
      IotDownstreamRabbitmqController.name,
    );
    this.ack(context);
    return true;
  }

  private async publishToProvider(payload: IotBridgeDownlinkCommandMessage): Promise<void> {
    this.validatePayload(payload);
    const device = await this.iotDownlinkService.resolveDeviceByIdOrSn(payload.deviceId);
    if (!device) {
      throw new PermanentDownstreamError(`device not found: ${payload.deviceId}`);
    }
    const vendor = resolveRequestedProvider(payload, device.provider);
    await this.iotProviderRegistry.getOrThrow(vendor).publish({
      deviceId: payload.deviceId,
      deviceName: device.deviceSn ?? device.id,
      productKey: device.productKey ?? undefined,
      topic: payload.topic,
      payload: payload.payload,
      qos: payload.qos ?? 1,
      requestId: payload.requestId,
    });
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
    const details = {
      message: error instanceof Error ? error.message : String(error),
    };
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
        IotDownstreamRabbitmqController.name,
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
      IotDownstreamRabbitmqController.name,
    );
  }

  private async resolveProviderName(payload: IotBridgeDownlinkCommandMessage): Promise<CloudIotVendorName> {
    if (payload.provider !== 'auto') {
      return normalizeIotVendor(payload.provider);
    }
    const device = await this.iotDownlinkService.resolveDeviceByIdOrSn(payload.deviceId);
    return normalizeIotVendor(device?.provider);
  }

  private ack(context: RmqContext): void {
    context.getChannelRef().ack(context.getMessage());
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
    return {
      requeue: delayMs !== undefined,
      delayMs: delayMs ?? 0,
    };
  }

  private nack(context: RmqContext, requeue: boolean): void {
    context.getChannelRef().nack(context.getMessage(), false, requeue);
  }
}

function resolveRequestedProvider(
  payload: IotBridgeDownlinkCommandMessage,
  deviceProvider: string | undefined,
): CloudIotVendorName {
  if (payload.provider !== 'auto') {
    return normalizeIotVendor(payload.provider);
  }
  if (!deviceProvider?.trim()) {
    throw new PermanentDownstreamError(`device provider is missing for ${payload.deviceId}`);
  }
  return normalizeIotVendor(deviceProvider);
}

class PermanentDownstreamError extends Error {}

function toDownstreamError(error: unknown): unknown {
  const message = error instanceof Error ? error.message : String(error);
  if (isPermanentProviderConfigurationError(message)) {
    return new PermanentDownstreamError(message);
  }
  return error;
}

function isPermanentProviderConfigurationError(message: string): boolean {
  return message.includes('EMQX REST publish requires IOT_ACCESS_KEY_ID/IOT_ACCESS_KEY_SECRET');
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
