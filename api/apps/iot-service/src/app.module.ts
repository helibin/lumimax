import { SQSClient } from '@aws-sdk/client-sqs';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  resolveIotCredentials,
  resolveIotRegion,
  resolveServiceEnvFilePaths,
} from '@lumimax/config';
import { HealthModule } from '@lumimax/health';
import {
  AwsIngressAdapterService,
  AwsProviderService,
  EmqxIngressAdapterService,
  EmqxProviderService,
  IotEgressAdapterRegistry,
  IotIngressAdapterRegistry,
} from '@lumimax/iot-kit';
import { LoggerModule, RequestIdMiddleware } from '@lumimax/logger';
import { SqsConsumerService } from '@lumimax/mq';
import { DeviceIotModule } from './device/device-iot.module';
import { DeviceAccessValidationService } from './device/devices/device-access-validation.service';
import { validateIotServiceEnv } from './config/iot-service.env.validation';
import { IotFacadeGrpcController } from './grpc/iot-facade.grpc.controller';
import { IotHealthController } from './health.controller';
import { AwsSqsIngress } from './ingress/aws-sqs/aws-sqs.ingress';
import { EmqxIngressService } from './ingress/emqx-ingress.service';
import { EmqxMqttIngress } from './ingress/emqx-mqtt/emqx-mqtt.ingress';
import { InternalMqttAuthService } from './ingress/internal-mqtt-auth.service';
import { IotController } from './ingress/iot.controller';
import { IOT_DEVICE_ACCESS } from './ingress/iot-device-access.port';
import { IotIngestService } from './pipeline/iot-ingest.service';
import { IotEnvelopeService } from './pipeline/iot-envelope.service';
import { IotMessageRegistryService } from './pipeline/iot-message-registry.service';
import { IotNormalizerService } from './pipeline/iot-normalizer.service';
import { DownlinkDispatchService } from './pipeline/downlink-dispatch.service';
import { TopicParserService } from './pipeline/topic-parser.service';
import { PersistenceModule } from './persistence/persistence.module';
import { IotApplicationService } from './provisioning/iot-application.service';
import { IOT_PROVISIONING } from './provisioning/iot-provisioning.port';
import { IotService } from './provisioning/iot.service';
import { IotBridgePublisherService } from './transport/iot-bridge.publisher.service';
import { IotBridgeRabbitmqController } from './transport/iot-bridge.rabbitmq.controller';
import { IOT_DOWNLINK } from './transport/iot-downlink.port';
import { IotDownlinkService } from './transport/iot-downlink.service';
import { IOT_MESSAGE_PUBLISHER } from './transport/iot-message-publisher.port';
import { IotUplinkBridgeService } from './transport/iot-uplink-bridge.service';
import { RabbitMQIotTransportModule } from './transport/rabbitmq-iot-transport.module';
import { DownstreamConsumer } from './rabbitmq/downstream.consumer';

@Module({
  imports: [
    LoggerModule,
    HealthModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveServiceEnvFilePaths('iot-service'),
      validate: validateIotServiceEnv,
    }),
    PersistenceModule,
    DeviceIotModule,
    RabbitMQIotTransportModule,
  ],
  controllers: [
    IotHealthController,
    IotController,
    IotFacadeGrpcController,
    IotBridgeRabbitmqController,
    DownstreamConsumer,
  ],
  providers: [
    {
      provide: SQSClient,
      useFactory: () => new SQSClient({
        region: resolveIotRegion() ?? 'us-west-2',
        credentials: resolveIotCredentials(),
      }),
    },
    SqsConsumerService,
    AwsProviderService,
    AwsIngressAdapterService,
    EmqxIngressAdapterService,
    EmqxProviderService,
    IotIngressAdapterRegistry,
    IotEgressAdapterRegistry,
    {
      provide: IOT_DEVICE_ACCESS,
      useExisting: DeviceAccessValidationService,
    },
    {
      provide: IOT_MESSAGE_PUBLISHER,
      useExisting: IotBridgePublisherService,
    },
    {
      provide: IOT_DOWNLINK,
      useExisting: IotDownlinkService,
    },
    {
      provide: IOT_PROVISIONING,
      useExisting: IotApplicationService,
    },
    InternalMqttAuthService,
    AwsSqsIngress,
    EmqxIngressService,
    EmqxMqttIngress,
    TopicParserService,
    IotEnvelopeService,
    IotNormalizerService,
    IotIngestService,
    IotMessageRegistryService,
    DownlinkDispatchService,
    IotBridgePublisherService,
    IotUplinkBridgeService,
    IotDownlinkService,
    IotService,
    IotApplicationService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
