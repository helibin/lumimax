import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import {
  RABBITMQ_CLIENT,
  RABBITMQ_DEFAULT_EVENTS_EXCHANGE,
  RABBITMQ_DEFAULT_EVENTS_EXCHANGE_TYPE,
  RABBITMQ_DEFAULT_PUBLISHER_QUEUE_SUFFIX,
  RABBITMQ_DEFAULT_URL,
} from './rabbitmq.constants';
import { RabbitMQIdempotencyService } from './rabbitmq-idempotency.service';
import { RabbitMQService } from './rabbitmq.service';

export interface RabbitMQModuleOptions {
  queue?: string;
  exchange?: string;
  exchangeType?: 'direct' | 'fanout' | 'topic' | 'headers' | (string & {});
  wildcards?: boolean;
  queueOptions?: {
    durable?: boolean;
  };
}

@Module({})
export class RabbitMQModule {
  static forRoot(options: RabbitMQModuleOptions = {}): DynamicModule {
    return {
      module: RabbitMQModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: RABBITMQ_CLIENT,
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => {
            const url =
              configService.get<string>('RABBITMQ_URL') ??
              RABBITMQ_DEFAULT_URL;
            const exchange =
              options.exchange
              ?? configService.get<string>('RABBITMQ_EVENTS_EXCHANGE')
              ?? RABBITMQ_DEFAULT_EVENTS_EXCHANGE;
            const exchangeType =
              options.exchangeType
              ?? (configService.get<string>('RABBITMQ_EVENTS_EXCHANGE_TYPE') as
                | 'direct'
                | 'fanout'
                | 'topic'
                | 'headers'
                | (string & {})
                | undefined)
              ?? RABBITMQ_DEFAULT_EVENTS_EXCHANGE_TYPE;
            const queue = options.queue ?? resolvePublisherQueue(configService);
            return ClientProxyFactory.create({
              transport: Transport.RMQ,
              options: {
                urls: [url],
                queue,
                exchange,
                exchangeType,
                wildcards: options.wildcards ?? true,
                queueOptions: {
                  durable: options.queueOptions?.durable ?? true,
                },
              },
            });
          },
        },
        RabbitMQIdempotencyService,
        RabbitMQService,
      ],
      exports: [RabbitMQService, RabbitMQIdempotencyService, RABBITMQ_CLIENT],
    };
  }
}

function resolvePublisherQueue(configService: ConfigService): string {
  const configuredQueue = configService.get<string>('RABBITMQ_PUBLISHER_QUEUE');
  if (configuredQueue && configuredQueue.trim().length > 0) {
    return configuredQueue.trim();
  }

  const serviceName =
    configService.get<string>('SERVICE_NAME')
    ?? configService.get<string>('npm_package_name')
    ?? 'app';
  const normalized = serviceName.replace(/^@[^/]+\//, '').replace(/\s+/g, '-');
  return `${normalized}${RABBITMQ_DEFAULT_PUBLISHER_QUEUE_SUFFIX}`;
}
