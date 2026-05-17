import { Controller, Inject, type OnModuleInit } from '@nestjs/common';
import { getEnvString, resolveConfiguredIotReceiveMode, resolveConfiguredIotVendor } from '@lumimax/config';
import { AppLogger } from '@lumimax/logger';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import type {
  IotBridgeUplinkMessage,
} from './iot-bridge.rabbitmq';
import {
  IOT_BRIDGE_UPSTREAM_EVENT,
  IOT_BRIDGE_UPSTREAM_LIFECYCLE_EVENT,
} from './iot-bridge.rabbitmq';
import { IotUplinkBridgeService } from './iot-uplink-bridge.service';

@Controller()
export class IotBridgeRabbitmqController implements OnModuleInit {
  constructor(
    @Inject(IotUplinkBridgeService)
    private readonly iotUplinkBridgeService: IotUplinkBridgeService,
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
        '当前 EMQX 配置为 IOT_RECEIVE_MODE=callback，但同时设置了 RABBITMQ_URL：如果 EMQX 同时向 HTTP/gRPC 与 MQTT 共享订阅链路投递上行消息，事件可能被重复处理；如需仅走应用桥接，请改用 mq 模式。',
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
      const rawMessage = context.getMessage() as RabbitMqRawMessage | undefined;
      await this.iotUplinkBridgeService.bridgeUplink(payload, {
        eventName,
        transport: 'rmq',
        meta: {
          ...(rawMessage?.fields?.deliveryTag !== undefined
            ? { rmqDeliveryTag: rawMessage.fields.deliveryTag }
            : {}),
          fields: summarizeLogValue(rawMessage?.fields ?? {}),
        },
      });
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
}

type RabbitMqRawMessage = {
  fields?: {
    deliveryTag?: number;
    exchange?: string;
    routingKey?: string;
    consumerTag?: string;
    redelivered?: boolean;
  };
  properties?: Record<string, unknown>;
  content?: Buffer;
};

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
