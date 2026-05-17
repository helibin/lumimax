import type { OnModuleDestroy } from '@nestjs/common';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  AppLogger,
  ThirdPartyErrorThrottle,
  formatError,
  readLoggerRuntimeConfig,
} from '@lumimax/logger';
import { createRequire } from 'node:module';
import type { RabbitMQEventName } from './rabbitmq.constants';
import type { RabbitMQBusinessEvent } from './rabbitmq.event';
import {
  buildRabbitMQBusinessEvent,
  resolveEventSource,
} from './rabbitmq.event';
import {
  RABBITMQ_PROFILE,
  type ResolvedRabbitMQProfile,
} from './rabbitmq.profile';
import type { EmitEventOptions } from './rabbitmq.service';

type AmqpEventHandler = (error?: unknown) => void;

type ConfirmChannel = {
  assertExchange: (
    exchange: string,
    type: string,
    options: { durable: boolean },
  ) => Promise<unknown>;
  publish: (
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: Record<string, unknown>,
    callback: (error?: unknown) => void,
  ) => boolean;
  close: () => Promise<void>;
  on: (event: 'error' | 'close', handler: AmqpEventHandler) => void;
};

type Connection = {
  createConfirmChannel: () => Promise<ConfirmChannel>;
  close: () => Promise<void>;
  on: (event: 'error' | 'close', handler: AmqpEventHandler) => void;
};

type AmqplibModule = {
  connect: (url: string) => Promise<Connection>;
};

@Injectable()
export class RabbitMQConfirmPublisherService implements OnModuleDestroy {
  private readonly source = resolveEventSource();
  private readonly stackMaxLines = readLoggerRuntimeConfig().stackMaxLines;
  private readonly errorThrottle = new ThirdPartyErrorThrottle({
    throttleMs: readLoggerRuntimeConfig().thirdPartyErrorThrottleMs,
  });

  private connection: Connection | null = null;
  private channel: ConfirmChannel | null = null;
  private channelBootstrap: Promise<ConfirmChannel> | null = null;

  constructor(
    @Inject(RABBITMQ_PROFILE) private readonly profile: ResolvedRabbitMQProfile,
    @Optional() private readonly logger?: AppLogger,
  ) {}

  async onModuleDestroy(): Promise<void> {
    const channel = this.channel;
    const connection = this.connection;
    this.channel = null;
    this.connection = null;
    this.channelBootstrap = null;
    await Promise.allSettled([
      channel?.close() ?? Promise.resolve(),
      connection?.close() ?? Promise.resolve(),
    ]);
  }

  async emitEventConfirmed<T = unknown>(
    eventName: RabbitMQEventName | string,
    data: T,
    options: EmitEventOptions = {},
  ): Promise<RabbitMQBusinessEvent<T>> {
    const envelope = buildRabbitMQBusinessEvent(eventName, data, {
      eventId: options.eventId,
      requestId: options.requestId,
      source: options.source ?? this.source,
    });
    const channel = await this.acquireChannel();
    const payload = Buffer.from(JSON.stringify(envelope), 'utf8');
    const publishOptions: Record<string, unknown> = {
      contentType: 'application/json',
      contentEncoding: 'utf-8',
      persistent: true,
      messageId: envelope.eventId,
      timestamp: Date.now(),
      type: String(eventName),
      headers: envelope.requestId ? { requestId: envelope.requestId } : undefined,
    };

    try {
      await new Promise<void>((resolve, reject) => {
        channel.publish(
          this.profile.exchange,
          String(eventName),
          payload,
          publishOptions,
          (error: unknown) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          },
        );
      });
      return envelope;
    } catch (error) {
      this.logChannelError(
        'rabbitmq confirm publish failed',
        error,
        {
          queue: options.queue ?? this.profile.queue,
          eventName,
          requestId: envelope.requestId,
          eventId: envelope.eventId,
        },
      );
      this.hardResetConnection();
      throw error;
    }
  }

  private async acquireChannel(): Promise<ConfirmChannel> {
    if (this.channel) {
      return this.channel;
    }
    if (!this.channelBootstrap) {
      this.channelBootstrap = this.createChannel().finally(() => {
        this.channelBootstrap = null;
      });
    }
    return this.channelBootstrap;
  }

  private async createChannel(): Promise<ConfirmChannel> {
    const amqplib = this.loadAmqplib();
    try {
      const connection = await amqplib.connect(this.profile.url);
      const channel = await connection.createConfirmChannel();
      await channel.assertExchange(this.profile.exchange, this.profile.exchangeType, {
        durable: true,
      });
      this.bindConnectionEvents(connection, channel);
      this.connection = connection;
      this.channel = channel;
      return channel;
    } catch (error) {
      this.logChannelError('rabbitmq confirm channel bootstrap failed', error, {
        queue: this.profile.queue,
      });
      this.hardResetConnection();
      throw error;
    }
  }

  private bindConnectionEvents(connection: Connection, channel: ConfirmChannel): void {
    connection.on('error', (error: unknown) => {
      this.logChannelError('rabbitmq confirm connection error', error, {
        queue: this.profile.queue,
      });
    });
    connection.on('close', () => {
      this.logger?.warn(
        'rabbitmq confirm connection closed',
        {
          queue: this.profile.queue,
          rabbitmqUrl: this.profile.url,
          exchange: this.profile.exchange,
          exchangeType: this.profile.exchangeType,
        },
        RabbitMQConfirmPublisherService.name,
      );
      if (this.connection === connection) {
        this.hardResetConnection();
      }
    });
    channel.on('error', (error: unknown) => {
      this.logChannelError('rabbitmq confirm channel error', error, {
        queue: this.profile.queue,
      });
    });
    channel.on('close', () => {
      this.logger?.warn(
        'rabbitmq confirm channel closed',
        {
          queue: this.profile.queue,
          rabbitmqUrl: this.profile.url,
          exchange: this.profile.exchange,
          exchangeType: this.profile.exchangeType,
        },
        RabbitMQConfirmPublisherService.name,
      );
      if (this.channel === channel) {
        this.channel = null;
      }
    });
  }

  private hardResetConnection(): void {
    const channel = this.channel;
    const connection = this.connection;
    this.channel = null;
    this.connection = null;
    void channel?.close().catch(() => undefined);
    void connection?.close().catch(() => undefined);
  }

  private logChannelError(
    message: string,
    error: unknown,
    meta: Record<string, unknown>,
  ): void {
    if (!this.logger) {
      return;
    }
    const formatted = formatError(error, this.stackMaxLines);
    const key = `${String(meta.queue ?? this.profile.queue)}:${formatted.errorType}:${formatted.rootCause}`;
    const throttle = this.errorThrottle.hit(key);
    if (!throttle.shouldLog) {
      return;
    }
    this.logger.warn(
      message,
      {
        ...meta,
        rabbitmqUrl: this.profile.url,
        exchange: this.profile.exchange,
        exchangeType: this.profile.exchangeType,
        errorType: formatted.errorType,
        rootCause: formatted.rootCause,
        shortMessage: formatted.shortMessage,
        hint: formatted.hint,
        stack: formatted.compactStack,
        ...(throttle.suppressedCount > 0
          ? { suppressedCount: throttle.suppressedCount }
          : {}),
      },
      RabbitMQConfirmPublisherService.name,
    );
  }

  private loadAmqplib(): AmqplibModule {
    const require = createRequire(__filename);
    return require('amqplib') as AmqplibModule;
  }
}
