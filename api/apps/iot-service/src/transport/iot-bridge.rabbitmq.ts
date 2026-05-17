import {
  getEnvNumber,
  IOT_BRIDGE_DEFAULT_PREFETCH,
  buildRabbitMqBusQueueArguments,
  IOT_BUS_BIZ_ROUTING_KEYS,
  IOT_BUS_DEAD_BIZ_ROUTING_KEY,
  IOT_BUS_DEAD_IOT_ROUTING_KEY,
  IOT_BUS_DEAD_ROUTING_KEYS,
  IOT_BUS_DOWNSTREAM_ROUTING_KEYS,
  IOT_BUS_UPSTREAM_ROUTING_KEYS,
  resolveConfiguredIotReceiveMode,
  resolveConfiguredIotVendor,
  resolveRabbitMqTopologyCatalog,
} from '@lumimax/config';
import { createRequire } from 'node:module';
import type { CloudIotVendorName } from '../iot.types';

export const IOT_BRIDGE_UPSTREAM_EVENT = 'iot.up.event';
export const IOT_BRIDGE_UPSTREAM_LIFECYCLE_EVENT = 'iot.up.lifecycle';
export const IOT_BRIDGE_DOWNSTREAM_PUBLISH_EVENT = 'iot.down.publish';
export const IOT_BIZ_UPLINK_RECEIVED_EVENT = 'biz.iot.message.received';
export const IOT_MESSAGE_STATUS_MAX_RETRIES = 5;

export interface IotBridgeUplinkMessage {
  vendor: CloudIotVendorName;
  topic: string;
  payload: Record<string, unknown>;
  receivedAt: number;
  requestId: string;
}

export interface IotBridgeDownlinkCommandMessage {
  direction: 'down';
  provider: 'auto' | CloudIotVendorName;
  messageId: string;
  deviceId: string;
  topic: string;
  event: string;
  payload: Record<string, unknown>;
  requestId: string;
  tenantId?: string;
  qos?: 0 | 1;
  retain?: boolean;
  trace?: Record<string, unknown>;
}

export interface IotBridgeBizUplinkMessage {
  vendor: CloudIotVendorName;
  topic: string;
  deviceId: string;
  topicKind: string;
  requestId: string;
  event: string;
  locale: string;
  payload: Record<string, unknown>;
  timestamp: number;
  receivedAt: string;
}

export function resolveIotBridgeRabbitmqUrl(): string | undefined {
  return resolveRabbitMqTopologyCatalog(process.env).broker.urlIot;
}

export function shouldUseIotBridgeRabbitmq(): boolean {
  const url = resolveIotBridgeRabbitmqUrl();
  if (!url) {
    return false;
  }
  if (resolveConfiguredIotVendor() === 'emqx' && resolveConfiguredIotReceiveMode() === 'callback') {
    return false;
  }
  return true;
}

export function shouldQueueDownlinkThroughBridge(vendor: CloudIotVendorName): boolean {
  void vendor;
  return shouldUseIotBridgeRabbitmq();
}

export function resolveIotBridgeEventPattern(topic: string): string {
  if (topic.startsWith('emqx/')) {
    return IOT_BRIDGE_UPSTREAM_LIFECYCLE_EVENT;
  }
  if (topic.includes('/event/')) {
    return IOT_BRIDGE_UPSTREAM_EVENT;
  }
  return IOT_BRIDGE_UPSTREAM_EVENT;
}

export function resolveBizEventsQueueName(): string {
  return resolveRabbitMqTopologyCatalog(process.env).queues.bizQueue;
}

export function resolveIotEventsQueueName(): string {
  return resolveRabbitMqTopologyCatalog(process.env).queues.iotQueue;
}

export function resolveIotQueueName(): string {
  return resolveIotEventsQueueName();
}

function resolveIotQueueArguments(kind: 'biz' | 'iot'): Record<string, unknown> {
  const catalog = resolveRabbitMqTopologyCatalog(process.env);
  return buildRabbitMqBusQueueArguments({
    ttlMs: catalog.iotMessageTtlMs,
    deadLetterExchange: catalog.broker.exchange,
    deadLetterRoutingKey:
      kind === 'biz'
        ? IOT_BUS_DEAD_BIZ_ROUTING_KEY
        : IOT_BUS_DEAD_IOT_ROUTING_KEY,
  });
}

export function resolveBizConsumerQueueOptions(): {
  durable: boolean;
  arguments: Record<string, unknown>;
} {
  return {
    durable: true,
    arguments: resolveIotQueueArguments('biz'),
  };
}

export function resolveIotConsumerQueueOptions(): {
  durable: boolean;
  arguments: Record<string, unknown>;
} {
  return {
    durable: true,
    arguments: resolveIotQueueArguments('iot'),
  };
}

export function resolveIotBridgePrefetchCount(): number {
  return getEnvNumber('IOT_BRIDGE_RABBITMQ_PREFETCH', IOT_BRIDGE_DEFAULT_PREFETCH);
}

export async function ensureIotDeadLetterTopology(): Promise<void> {
  const catalog = resolveRabbitMqTopologyCatalog(process.env);
  const url = catalog.broker.urlIot;
  if (!url) {
    return;
  }

  const require = createRequire(__filename);
  const amqplib = require('amqplib') as {
    connect: (url: string) => Promise<{
      close: () => Promise<void>;
      createChannel: () => Promise<{
        assertExchange: (
          exchange: string,
          type: string,
          options: { durable: boolean },
        ) => Promise<unknown>;
        assertQueue: (
          queue: string,
          options: { durable: boolean; arguments?: Record<string, unknown> },
        ) => Promise<unknown>;
        bindQueue: (
          queue: string,
          exchange: string,
          routingKey: string,
        ) => Promise<unknown>;
        close: () => Promise<void>;
      }>;
    }>;
  };

  const connection = await amqplib.connect(url);
  try {
    const channel = await connection.createChannel();
    try {
      await channel.assertExchange(catalog.broker.exchange, catalog.broker.exchangeType, {
        durable: true,
      });
      await channel.assertQueue(catalog.queues.bizQueue, resolveBizConsumerQueueOptions());
      await channel.assertQueue(
        catalog.queues.iotQueue,
        resolveIotConsumerQueueOptions(),
      );
      await channel.assertQueue(catalog.queues.iotDeadQueue, { durable: true });
      for (const routingKey of IOT_BUS_BIZ_ROUTING_KEYS) {
        await channel.bindQueue(catalog.queues.bizQueue, catalog.broker.exchange, routingKey);
      }
      for (const routingKey of IOT_BUS_UPSTREAM_ROUTING_KEYS) {
        await channel.bindQueue(
          catalog.queues.iotQueue,
          catalog.broker.exchange,
          routingKey,
        );
      }
      for (const routingKey of IOT_BUS_DOWNSTREAM_ROUTING_KEYS) {
        await channel.bindQueue(
          catalog.queues.iotQueue,
          catalog.broker.exchange,
          routingKey,
        );
      }
      for (const routingKey of IOT_BUS_DEAD_ROUTING_KEYS) {
        await channel.bindQueue(catalog.queues.iotDeadQueue, catalog.broker.exchange, routingKey);
      }
    } finally {
      await channel.close();
    }
  } finally {
    await connection.close();
  }
}
