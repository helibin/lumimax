import { registerAs } from '@nestjs/config';

export const infrastructureConfigToken = 'infrastructure';

export interface InfrastructureConfigValues {
  rabbitmqUrl?: string;
  rabbitmqEventsExchange: string;
  rabbitmqEventsExchangeType: 'direct' | 'fanout' | 'topic' | 'headers' | (string & {});
  rabbitmqPublisherQueue?: string;
  notificationEventsQueue: string;
  paymentGrpcUrl: string;
  paymentGrpcEndpoint: string;
  redisUrl?: string;
}

export const InfrastructureConfig = registerAs(
  infrastructureConfigToken,
  (): InfrastructureConfigValues => ({
    rabbitmqUrl: process.env.RABBITMQ_URL,
    rabbitmqEventsExchange: process.env.RABBITMQ_EVENTS_EXCHANGE ?? 'app.events',
    rabbitmqEventsExchangeType:
      (process.env.RABBITMQ_EVENTS_EXCHANGE_TYPE as
        | 'direct'
        | 'fanout'
        | 'topic'
        | 'headers'
        | (string & {})
        | undefined) ?? 'topic',
    rabbitmqPublisherQueue: process.env.RABBITMQ_PUBLISHER_QUEUE,
    notificationEventsQueue:
      process.env.NOTIFICATION_EVENTS_QUEUE ?? 'notification.events',
    paymentGrpcUrl: process.env.PAYMENT_GRPC_URL ?? '0.0.0.0:50051',
    paymentGrpcEndpoint:
      process.env.PAYMENT_GRPC_ENDPOINT ?? 'localhost:50051',
    redisUrl: process.env.REDIS_URL,
  }),
);
