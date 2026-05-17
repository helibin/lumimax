import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import {
  AppLogger,
  ThirdPartyErrorThrottle,
  formatError,
  readLoggerRuntimeConfig,
} from '@lumimax/logger';
import { lastValueFrom } from 'rxjs';
import type { RabbitMQEventName } from './rabbitmq.constants';
import {
  RABBITMQ_CLIENT,
} from './rabbitmq.constants';
import {
  RABBITMQ_PROFILE,
  type ResolvedRabbitMQProfile,
} from './rabbitmq.profile';
import type { RabbitMQBusinessEvent } from './rabbitmq.event';
import {
  buildRabbitMQBusinessEvent,
  resolveEventSource,
} from './rabbitmq.event';

void AppLogger;

export interface EmitEventOptions {
  requestId?: string;
  eventId?: string;
  source?: string;
  queue?: string;
}

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly clients = new Map<string, ClientProxy>();
  private readonly observedEmitters = new WeakSet<object>();
  private readonly source = resolveEventSource();
  private readonly stackMaxLines = readLoggerRuntimeConfig().stackMaxLines;
  private readonly errorThrottle = new ThirdPartyErrorThrottle({
    throttleMs: readLoggerRuntimeConfig().thirdPartyErrorThrottleMs,
  });

  private readonly client: ClientProxy;
  private readonly profile: ResolvedRabbitMQProfile;
  private readonly logger?: AppLogger;

  constructor(
    @Inject(RABBITMQ_CLIENT) client: ClientProxy,
    @Inject(RABBITMQ_PROFILE) profile: ResolvedRabbitMQProfile,
    @Optional() logger?: AppLogger,
  ) {
    this.client = client;
    this.profile = profile;
    this.logger = logger;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.connectClient(this.client, this.resolveDefaultClientQueue());
    } catch {
      // Keep service boot resilient when RabbitMQ is temporarily unavailable.
      // Publishing calls still attempt reconnect on demand.
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const client of this.clients.values()) {
      client.close();
    }
    this.client.close();
  }

  async emitEvent<T = unknown>(
    eventName: RabbitMQEventName | string,
    data: T,
    options: EmitEventOptions = {},
  ): Promise<RabbitMQBusinessEvent<T>> {
    const envelope = buildRabbitMQBusinessEvent(eventName, data, {
      eventId: options.eventId,
      requestId: options.requestId,
      source: options.source ?? this.source,
    });

    const queue = options.queue ?? this.resolveDefaultClientQueue();
    const client = this.getClient(options.queue);

    try {
      await this.connectClient(client, queue);
      await lastValueFrom(client.emit(eventName, envelope));
      return envelope;
    } catch (error) {
      this.logClientError(
        'rabbitmq unavailable, event publishing deferred',
        error,
        {
          queue,
          eventName,
          requestId: envelope.requestId,
          eventId: envelope.eventId,
        },
      );
      throw error;
    }
  }

  private getClient(queue?: string): ClientProxy {
    if (!queue || queue === this.resolveDefaultClientQueue()) {
      return this.client;
    }
    const existed = this.clients.get(queue);
    if (existed) {
      return existed;
    }

    const created = ClientProxyFactory.create({
      transport: Transport.RMQ,
      options: {
        urls: [this.profile.url],
        queue,
        exchange: this.profile.exchange,
        exchangeType: this.profile.exchangeType,
        wildcards: true,
        queueOptions: {
          durable: true,
          ...mergeRabbitMqClientQueueArguments(this.profile.queueArguments),
        },
      },
    });
    this.clients.set(queue, created);
    return created;
  }

  private async connectClient(client: ClientProxy, queue: string): Promise<void> {
    this.attachClientListeners(client, queue);
    try {
      await client.connect();
    } catch (error) {
      this.logClientError('rabbitmq connect failed', error, { queue });
      throw error;
    }
  }

  private attachClientListeners(client: ClientProxy, queue: string): void {
    const innerClient = (client as { client?: unknown }).client as
      | Record<string, unknown>
      | undefined;
    if (!innerClient || typeof innerClient !== 'object') {
      return;
    }
    if (this.observedEmitters.has(innerClient)) {
      return;
    }

    const on = (innerClient as { on?: unknown }).on;
    if (typeof on !== 'function') {
      return;
    }
    this.observedEmitters.add(innerClient);

    on.call(innerClient, 'error', (error: unknown) => {
      this.logClientError('rabbitmq client error', error, { queue });
    });
    on.call(innerClient, 'close', () => {
      this.logger?.warn(
        'rabbitmq connection closed',
        {
          queue,
          rabbitmqUrl: this.profile.url,
          exchange: this.profile.exchange,
          exchangeType: this.profile.exchangeType,
        },
        RabbitMQService.name,
      );
    });
  }

  private logClientError(
    message: string,
    error: unknown,
    meta: Record<string, unknown>,
  ): void {
    if (!this.logger) {
      return;
    }
    const formatted = formatError(error, this.stackMaxLines);
    const key = `${String(meta.queue ?? this.resolveDefaultClientQueue())}:${formatted.errorType}:${formatted.rootCause}`;
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
      RabbitMQService.name,
    );
  }

  private resolveDefaultClientQueue(): string {
    const fromClient = (this.client as { queue?: unknown }).queue;
    if (typeof fromClient === 'string' && fromClient.trim().length > 0) {
      return fromClient.trim();
    }
    return this.profile.queue;
  }
}

function mergeRabbitMqClientQueueArguments(
  args: Record<string, unknown> | undefined,
): { arguments?: Record<string, unknown> } {
  if (!args || Object.keys(args).length === 0) {
    return {};
  }
  return { arguments: args };
}
