import { Inject, Injectable, Optional } from '@nestjs/common';
import { AppLogger } from '@lumimax/logger';
import { RabbitMQService } from '@lumimax/mq';
import {
  IOT_BRIDGE_DOWNSTREAM_PUBLISH_EVENT,
  resolveIotBridgeEventPattern,
  resolveIotQueueName,
  shouldUseIotBridgeRabbitmq,
} from './iot-bridge.rabbitmq';
import type {
  IotMessagePublisherPort,
  PublishIotDownlinkCommandInput,
  PublishIotUplinkInput,
} from './iot-message-publisher.port';

@Injectable()
export class IotBridgePublisherService implements IotMessagePublisherPort {
  constructor(
    @Optional() @Inject(RabbitMQService)
    private readonly rabbitmqService?: RabbitMQService,
    @Optional() @Inject(AppLogger)
    private readonly logger?: AppLogger,
  ) {}

  isEnabled(): boolean {
    return shouldUseIotBridgeRabbitmq() && Boolean(this.rabbitmqService);
  }

  async publishUplink(input: PublishIotUplinkInput): Promise<void> {
    if (!this.rabbitmqService) {
      throw new Error('IoT bridge 的 RabbitMQ 发布器不可用');
    }
    const eventName = resolveIotBridgeEventPattern(input.topic);
    await this.rabbitmqService.emitEvent(eventName, input, {
      requestId: input.requestId,
      source: 'iot-bridge',
    });
    this.logger?.debug(
      'IoT 上行消息已转发到 RabbitMQ bridge',
      {
        requestId: input.requestId,
        idLabel: 'ReqId',
        vendor: input.vendor,
        topic: input.topic,
        eventName,
      },
      IotBridgePublisherService.name,
    );
  }

  async publishDownlinkCommand(input: PublishIotDownlinkCommandInput): Promise<void> {
    if (!this.rabbitmqService) {
      throw new Error('IoT bridge 的 RabbitMQ 发布器不可用');
    }
    await this.rabbitmqService.emitEvent(IOT_BRIDGE_DOWNSTREAM_PUBLISH_EVENT, input, {
      requestId: input.requestId,
      source: 'biz-service',
      queue: resolveIotQueueName(),
    });
    this.logger?.debug(
      'IoT 下行指令已转发到 RabbitMQ bridge',
      {
        requestId: input.requestId,
        idLabel: 'ReqId',
        provider: input.provider,
        deviceId: input.deviceId,
        topic: input.topic,
        eventName: IOT_BRIDGE_DOWNSTREAM_PUBLISH_EVENT,
      },
      IotBridgePublisherService.name,
    );
  }
}
