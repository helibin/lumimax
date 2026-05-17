import { registerAs } from '@nestjs/config';
import {
  resolveRabbitMqTopologyCatalog,
} from './rabbitmq-topology.config';

export const infrastructureConfigToken = 'infrastructure';

export interface InfrastructureConfigValues {
  rabbitmqUrl?: string;
  rabbitmqEventsExchange: string;
  rabbitmqEventsExchangeType: 'direct' | 'fanout' | 'topic' | 'headers' | (string & {});
  rabbitmqQueue?: string;
  iotRabbitmqUrl?: string;
  iotRabbitmqEventsExchange: string;
  iotRabbitmqEventsExchangeType: 'direct' | 'fanout' | 'topic' | 'headers' | (string & {});
  iotRabbitmqQueue?: string;
  iotRabbitmqDeadQueue?: string;
  paymentGrpcUrl: string;
  paymentGrpcEndpoint: string;
  redisUrl?: string;
}

export const InfrastructureConfig = registerAs(
  infrastructureConfigToken,
  (): InfrastructureConfigValues => {
    const catalog = resolveRabbitMqTopologyCatalog(process.env);
    return {
      rabbitmqUrl: catalog.broker.urlApp,
      rabbitmqEventsExchange: catalog.broker.exchange,
      rabbitmqEventsExchangeType: catalog.broker.exchangeType,
      rabbitmqQueue: catalog.queues.bizQueue,
      iotRabbitmqUrl: catalog.broker.urlIot,
      iotRabbitmqEventsExchange: catalog.broker.exchange,
      iotRabbitmqEventsExchangeType: catalog.broker.exchangeType,
      iotRabbitmqQueue: catalog.queues.iotQueue,
      iotRabbitmqDeadQueue: catalog.queues.iotDeadQueue,
      paymentGrpcUrl: process.env.PAYMENT_GRPC_URL ?? '0.0.0.0:50051',
      paymentGrpcEndpoint:
        process.env.PAYMENT_GRPC_ENDPOINT ?? 'localhost:50051',
      redisUrl: process.env.REDIS_URL,
    };
  },
);
