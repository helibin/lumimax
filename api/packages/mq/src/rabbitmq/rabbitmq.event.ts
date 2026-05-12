import {
  generateId,
  generateRequestId,
  getCurrentRequestId,
} from '@lumimax/runtime';
import { getEnvString } from '@lumimax/config';
import type { RabbitMQEventName } from './rabbitmq.constants';

export interface RabbitMQBusinessEvent<T = unknown> {
  eventId: string;
  eventName: RabbitMQEventName | string;
  occurredAt: string;
  source: string;
  data: T;
  requestId?: string;
}

export interface BuildRabbitMQEventOptions {
  eventId?: string;
  requestId?: string;
  source?: string;
}

export function buildRabbitMQBusinessEvent<T>(
  eventName: RabbitMQEventName | string,
  data: T,
  options: BuildRabbitMQEventOptions = {},
): RabbitMQBusinessEvent<T> {
  return {
    eventId: options.eventId ?? generateId(),
    eventName,
    occurredAt: new Date().toISOString(),
    source: options.source ?? resolveEventSource(),
    data,
    requestId: options.requestId ?? getCurrentRequestId() ?? generateRequestId(),
  };
}

export function resolveEventSource(): string {
  const envName = getEnvString('SERVICE_NAME')?.trim();
  if (envName) {
    return envName;
  }

  const packageName = getEnvString('npm_package_name')?.trim();
  if (packageName) {
    return packageName.replace(/^@[^/]+\//, '');
  }

  return 'unknown-service';
}
