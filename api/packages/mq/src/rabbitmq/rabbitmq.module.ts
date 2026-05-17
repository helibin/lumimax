import type {
  DynamicModule,
  FactoryProvider,
  InjectionToken,
  ModuleMetadata,
  OptionalFactoryDependency,
} from '@nestjs/common';
import { Module } from '@nestjs/common';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import {
  RABBITMQ_CLIENT,
} from './rabbitmq.constants';
import {
  RABBITMQ_PROFILE,
  type RabbitMQProfileOptions,
  resolveRabbitMQProfile,
} from './rabbitmq.profile';
import { RabbitMQConfirmPublisherService } from './rabbitmq-confirm-publisher.service';
import { RabbitMQIdempotencyService } from './rabbitmq-idempotency.service';
import { RabbitMQService } from './rabbitmq.service';

export interface RabbitMQModuleOptions extends RabbitMQProfileOptions {
  queueOptions?: {
    durable?: boolean;
    arguments?: Record<string, unknown>;
  };
  wildcards?: boolean;
}

export interface RabbitMQModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
  useFactory: (...args: any[]) => RabbitMQModuleOptions | Promise<RabbitMQModuleOptions>;
}

const RABBITMQ_MODULE_OPTIONS = 'RABBITMQ_MODULE_OPTIONS';

@Module({})
export class RabbitMQModule {
  static forRoot(options: RabbitMQModuleAsyncOptions): DynamicModule {
    return this.createDynamicModule({
      imports: options.imports,
      providers: [
        {
          provide: RABBITMQ_MODULE_OPTIONS,
          inject: options.inject ?? [],
          useFactory: options.useFactory,
        },
      ],
    });
  }

  private static createDynamicModule({
    imports,
    providers,
  }: {
    imports?: ModuleMetadata['imports'];
    providers: FactoryProvider[];
  }): DynamicModule {
    return {
      module: RabbitMQModule,
      imports,
      providers: [
        ...providers,
        {
          provide: RABBITMQ_PROFILE,
          inject: [RABBITMQ_MODULE_OPTIONS],
          useFactory: (options: RabbitMQModuleOptions) =>
            resolveRabbitMQProfile({
              url: options.url,
              exchange: options.exchange,
              exchangeType: options.exchangeType,
              queue: options.queue,
              queueArguments: options.queueArguments ?? options.queueOptions?.arguments,
            }),
        },
        {
          provide: RABBITMQ_CLIENT,
          inject: [RABBITMQ_MODULE_OPTIONS, RABBITMQ_PROFILE],
          useFactory: (
            options: RabbitMQModuleOptions,
            profile: ReturnType<typeof resolveRabbitMQProfile>,
          ) => {
            return ClientProxyFactory.create({
              transport: Transport.RMQ,
              options: {
                urls: [profile.url],
                queue: profile.queue,
                exchange: profile.exchange,
                exchangeType: profile.exchangeType,
                wildcards: options.wildcards ?? true,
                queueOptions: {
                  durable: options.queueOptions?.durable ?? true,
                  ...queueArgumentsToNestOptions(
                    options.queueArguments ?? options.queueOptions?.arguments,
                  ),
                },
              },
            });
          },
        },
        RabbitMQIdempotencyService,
        RabbitMQConfirmPublisherService,
        RabbitMQService,
      ],
      exports: [
        RabbitMQService,
        RabbitMQIdempotencyService,
        RabbitMQConfirmPublisherService,
        RABBITMQ_CLIENT,
      ],
    };
  }
}

function queueArgumentsToNestOptions(
  args: Record<string, unknown> | undefined,
): { arguments?: Record<string, unknown> } {
  if (!args || Object.keys(args).length === 0) {
    return {};
  }
  return { arguments: args };
}
