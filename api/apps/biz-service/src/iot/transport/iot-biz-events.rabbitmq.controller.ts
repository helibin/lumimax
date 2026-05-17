import { Controller, Inject } from '@nestjs/common';
import { AppLogger } from '@lumimax/logger';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { BizIotTopicKind, type NormalizedBizIotMessage } from '../iot.types';
import { IotIngestService } from '../pipeline/iot-ingest.service';
import type { IotBridgeBizUplinkMessage } from './iot-bridge.rabbitmq';
import { IOT_BIZ_UPLINK_RECEIVED_EVENT } from './iot-bridge.rabbitmq';

@Controller()
export class IotBizEventsRabbitmqController {
  constructor(
    @Inject(IotIngestService)
    private readonly iotIngestService: IotIngestService,
    @Inject(AppLogger)
    private readonly logger: AppLogger,
  ) {}

  @EventPattern(IOT_BIZ_UPLINK_RECEIVED_EVENT)
  async handleBizUplink(
    @Payload() payload: IotBridgeBizUplinkMessage,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    try {
      await this.iotIngestService.ingestNormalizedMessage(this.toNormalizedMessage(payload));
      this.ack(context);
    } catch (error) {
      this.logger.warn(
        '业务侧消费 IoT 业务事件失败',
        {
          requestId: payload.requestId,
          idLabel: 'ReqId',
          topic: payload.topic,
          event: payload.event,
          reason: error instanceof Error ? error.message : String(error),
        },
        IotBizEventsRabbitmqController.name,
      );
      this.nack(context);
      throw error;
    }
  }

  private toNormalizedMessage(payload: IotBridgeBizUplinkMessage): NormalizedBizIotMessage {
    return {
      vendor: payload.vendor,
      topic: payload.topic,
      deviceId: payload.deviceId,
      topicKind: payload.topicKind as BizIotTopicKind,
      requestId: payload.requestId,
      event: payload.event,
      locale: payload.locale,
      payload: payload.payload,
      timestamp: payload.timestamp,
      receivedAt: new Date(payload.receivedAt),
    };
  }

  private ack(context: RmqContext): void {
    context.getChannelRef().ack(context.getMessage());
  }

  private nack(context: RmqContext): void {
    context.getChannelRef().nack(context.getMessage(), false, false);
  }
}
