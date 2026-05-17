import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  resolveRabbitMqTopologyCatalog,
} from '@lumimax/config';
import { RabbitMQModule } from '@lumimax/mq';
import { PersistenceModule } from '../persistence/persistence.module';
import { DeviceIotModule } from '../device/device-iot.module';
import { DietModule } from '../diet/diet.module';
import { IotDispatcherService } from './pipeline/iot-dispatcher.service';
import { IotIngestService } from './pipeline/iot-ingest.service';
import { IotMessageRegistryService } from './pipeline/iot-message-registry.service';
import { IotNormalizerService } from './pipeline/iot-normalizer.service';
import { IotDownlinkService } from './transport/iot-downlink.service';
import { IotEnvelopeService } from './pipeline/iot-envelope.service';
import { TopicParserService } from './pipeline/topic-parser.service';
import { IotBridgePublisherService } from './transport/iot-bridge.publisher.service';
import { IotBizEventsRabbitmqController } from './transport/iot-biz-events.rabbitmq.controller';
import { IOT_DOWNLINK } from './transport/iot-downlink.port';
import { IOT_MESSAGE_PUBLISHER } from './transport/iot-message-publisher.port';

@Module({
  imports: [
    PersistenceModule,
    DeviceIotModule,
    DietModule,
    RabbitMQModule.forRoot({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (_configService: ConfigService) => {
        const rabbitmqCatalog = resolveRabbitMqTopologyCatalog(process.env);
        return {
          url: rabbitmqCatalog.broker.urlIot!,
          exchange: rabbitmqCatalog.broker.exchange,
          exchangeType: rabbitmqCatalog.broker.exchangeType,
          queue: rabbitmqCatalog.queues.iotQueue,
        };
      },
    }),
  ],
  controllers: [
    IotBizEventsRabbitmqController,
  ],
  providers: [
    {
      provide: IOT_MESSAGE_PUBLISHER,
      useExisting: IotBridgePublisherService,
    },
    {
      provide: IOT_DOWNLINK,
      useExisting: IotDownlinkService,
    },
    TopicParserService,
    IotEnvelopeService,
    IotNormalizerService,
    IotDispatcherService,
    IotIngestService,
    IotMessageRegistryService,
    IotBridgePublisherService,
    IotDownlinkService,
  ],
  exports: [
    TopicParserService,
    IotEnvelopeService,
    IotNormalizerService,
    IotDispatcherService,
    IotIngestService,
    IotMessageRegistryService,
    IotDownlinkService,
    IOT_DOWNLINK,
    IOT_MESSAGE_PUBLISHER,
  ],
})
export class IotModule {}
