import { Controller, Inject, type OnModuleInit } from '@nestjs/common';
import { getEnvString, resolveConfiguredIotReceiveMode, resolveConfiguredIotVendor } from '@lumimax/config';
import { AppLogger } from '@lumimax/logger';
import { RabbitMQService } from '@lumimax/mq';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { IotMessageRegistryService } from '../pipeline/iot-message-registry.service';
import { IotNormalizerService } from '../pipeline/iot-normalizer.service';
import type {
  IotBridgeBizUplinkMessage,
  IotBridgeUplinkMessage,
} from './iot-bridge.rabbitmq';
import {
  IOT_BIZ_UPLINK_RECEIVED_EVENT,
  IOT_BRIDGE_UPSTREAM_EVENT,
  IOT_BRIDGE_UPSTREAM_LIFECYCLE_EVENT,
  resolveBizEventsQueueName,
} from './iot-bridge.rabbitmq';

@Controller()
export class IotBridgeRabbitmqController implements OnModuleInit {
  constructor(
    @Inject(IotNormalizerService)
    private readonly iotNormalizerService: IotNormalizerService,
    @Inject(IotMessageRegistryService)
    private readonly iotMessageRegistryService: IotMessageRegistryService,
    @Inject(RabbitMQService)
    private readonly rabbitmqService: RabbitMQService,
    @Inject(AppLogger)
    private readonly logger: AppLogger,
  ) {}

  onModuleInit(): void {
    if (
      resolveConfiguredIotVendor() === 'emqx'
      && resolveConfiguredIotReceiveMode() === 'callback'
      && Boolean(getEnvString('RABBITMQ_URL')?.trim())
    ) {
      this.logger.warn(
        '当前 EMQX 配置为 IOT_RECEIVE_MODE=callback，但同时设置了 RABBITMQ_URL：如果 EMQX 同时向 HTTP/gRPC 和 RabbitMQ 投递上行消息，事件可能被重复处理；如需仅走 RabbitMQ 上下行桥接，请改用 mq 模式。',
        { suppressRequestContext: true },
        IotBridgeRabbitmqController.name,
      );
    }
  }

  @EventPattern(IOT_BRIDGE_UPSTREAM_EVENT)
  handleEvent(
    @Payload() payload: IotBridgeUplinkMessage,
    @Ctx() context: RmqContext,
  ) {
    return this.handleUplink(payload, IOT_BRIDGE_UPSTREAM_EVENT, context);
  }

  @EventPattern(IOT_BRIDGE_UPSTREAM_LIFECYCLE_EVENT)
  handleLifecycle(
    @Payload() payload: IotBridgeUplinkMessage,
    @Ctx() context: RmqContext,
  ) {
    return this.handleUplink(payload, IOT_BRIDGE_UPSTREAM_LIFECYCLE_EVENT, context);
  }

  private async handleUplink(
    payload: IotBridgeUplinkMessage,
    eventName: string,
    context: RmqContext,
  ): Promise<void> {
    try {
      const normalized = this.iotNormalizerService.normalize({
        vendor: payload.vendor,
        topic: payload.topic,
        payload: payload.payload ?? {},
        receivedAt: payload.receivedAt,
      });
      const recorded = await this.iotMessageRegistryService.recordReceived(normalized);
      if (recorded.duplicate && isDuplicateUplinkStatus(recorded.entity.status)) {
        const rawMessage = context.getMessage() as { fields?: { deliveryTag?: number } } | undefined;
        const deliveryTag = rawMessage?.fields?.deliveryTag;
        this.logger.debug(
          'IoT bridge 跳过重复上行消息',
          {
            suppressRequestContext: true,
            messageKey: recorded.entity.messageKey,
            topic: normalized.topic,
            eventName,
            previousStatus: recorded.entity.status,
            ...(deliveryTag !== undefined ? { rmqDeliveryTag: deliveryTag } : {}),
          },
          IotBridgeRabbitmqController.name,
        );
        this.ack(context);
        return;
      }
      await this.rabbitmqService.emitEvent(IOT_BIZ_UPLINK_RECEIVED_EVENT, this.toBizEvent(normalized), {
        requestId: normalized.requestId,
        source: 'iot-bridge',
        queue: resolveBizEventsQueueName(),
      });
      await this.iotMessageRegistryService.markQueued(normalized.requestId, {
        forwardedTo: IOT_BIZ_UPLINK_RECEIVED_EVENT,
        eventName,
      });
      this.logger.debug(
        'IoT 上行消息已由 RabbitMQ bridge 消费',
        {
          suppressRequestContext: true,
          messageKey: normalized.requestId,
          vendor: normalized.vendor,
          topic: normalized.topic,
          eventName,
        },
        IotBridgeRabbitmqController.name,
      );
      this.ack(context);
    } catch (error) {
      this.nack(context);
      throw error;
    }
  }

  private ack(context: RmqContext): void {
    context.getChannelRef().ack(context.getMessage());
  }

  private nack(context: RmqContext): void {
    context.getChannelRef().nack(context.getMessage(), false, false);
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
