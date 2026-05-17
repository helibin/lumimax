import {
  normalizeLocalhostAmqpUrl,
} from '@lumimax/config';

export interface RabbitMQProfileOptions {
  url: string;
  exchange: string;
  exchangeType: 'direct' | 'fanout' | 'topic' | 'headers' | (string & {});
  queue: string;
  /** Passed to `assertQueue` as `arguments` (e.g. dead-letter routing). */
  queueArguments?: Record<string, unknown>;
}

export interface ResolvedRabbitMQProfile {
  url: string;
  exchange: string;
  exchangeType: 'direct' | 'fanout' | 'topic' | 'headers' | (string & {});
  queue: string;
  queueArguments?: Record<string, unknown>;
}

export const RABBITMQ_PROFILE = 'RABBITMQ_PROFILE';

export function resolveRabbitMQProfile(
  options: RabbitMQProfileOptions,
): ResolvedRabbitMQProfile {
  const url = normalizeLocalhostAmqpUrl(options.url);
  const exchange = readRequiredString(options.exchange, 'exchange');
  const exchangeType = options.exchangeType;
  const queue = readRequiredString(options.queue, 'queue');

  if (!url) {
    throw new Error('RabbitMQ profile requires a non-empty url');
  }

  return {
    url,
    exchange,
    exchangeType,
    queue,
    queueArguments: options.queueArguments,
  };
}

function readRequiredString(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`RabbitMQ profile requires a non-empty ${fieldName}`);
  }
  return normalized;
}
