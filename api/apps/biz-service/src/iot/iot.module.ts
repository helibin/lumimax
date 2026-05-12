import { SQSClient } from '@aws-sdk/client-sqs';
import { forwardRef, Module } from '@nestjs/common';
import { resolveCloudCredentials, resolveCloudRegion } from '@lumimax/config';
import { SqsConsumerService } from '@lumimax/mq';
import { PersistenceModule } from '../persistence/persistence.module';
import { DeviceModule } from '../device/device.module';
import { DietModule } from '../diet/diet.module';
import { AwsIotSqsConsumer } from './providers/aws/aws-iot-sqs.consumer';
import { IotApplicationService } from './bridge/iot-application.service';
import { IotController } from './bridge/iot.controller';
import { IotFacadeGrpcController } from './iot.facade.grpc.controller';
import { IotFacade } from './iot.facade';
import { IotDispatcherService } from './events/iot-dispatcher.service';
import { IotIngestService } from './events/iot-ingest.service';
import { IotMessageRegistryService } from './events/iot-message-registry.service';
import { IotNormalizerService } from './events/iot-normalizer.service';
import { IotDownlinkService } from './providers/aws/iot-downlink.service';
import { IotEnvelopeService } from './events/iot-envelope.service';
import { IotEventDispatcherService } from './events/iot-event-dispatcher.service';
import { TopicParserService } from './events/topic-parser.service';
import { IotTopicService } from './bridge/iot-topic.service';
import { IotService } from './bridge/iot.service';
import { EmqxIngressService } from './bridge/emqx-ingress.service';
import { InternalMqttAuthService } from './bridge/internal-mqtt-auth.service';

@Module({
  imports: [PersistenceModule, forwardRef(() => DeviceModule), DietModule],
  controllers: [IotController, IotFacadeGrpcController],
  providers: [
    {
      provide: SQSClient,
      useFactory: () => {
        const credentials = resolveCloudCredentials();
        return new SQSClient({
          region: resolveCloudRegion() ?? 'us-west-2',
          credentials,
        });
      },
    },
    SqsConsumerService,
    IotService,
    InternalMqttAuthService,
    AwsIotSqsConsumer,
    IotApplicationService,
    EmqxIngressService,
    IotFacade,
    TopicParserService,
    IotTopicService,
    IotEnvelopeService,
    IotNormalizerService,
    IotDispatcherService,
    IotEventDispatcherService,
    IotDownlinkService,
    IotIngestService,
    IotMessageRegistryService,
  ],
  exports: [IotService, IotApplicationService, EmqxIngressService, IotFacade, IotDownlinkService],
})
export class IotModule {}
