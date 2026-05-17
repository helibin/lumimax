import { Injectable } from '@nestjs/common';
import type {
  IotIngressAdapter,
  IotIngressChannel,
  NormalizedCloudIotIngressMessage,
} from '../../interfaces/iot-ingress-adapter.interface';

@Injectable()
export class AwsIngressAdapterService implements IotIngressAdapter {
  readonly vendor = 'aws' as const;

  supports(channel: IotIngressChannel): boolean {
    return channel === 'queue' || channel === 'webhook' || channel === 'ingest';
  }

  normalize(input: { channel: IotIngressChannel; body: unknown }): NormalizedCloudIotIngressMessage {
    if (input.channel === 'queue') {
      return unwrapQueueMessage(input.body, 'aws');
    }
    if (input.channel === 'webhook' || input.channel === 'ingest') {
      return normalizeTopicPayloadBody(input.body, 'aws');
    }
    throw new Error(`Unsupported AWS ingress channel: ${input.channel}`);
  }
}

export function unwrapQueueMessage(
  body: unknown,
  fallbackVendor: 'aws',
): NormalizedCloudIotIngressMessage {
  const root = asRecord(body);
  const nested = unwrapNestedRecord(root);
  const topic =
    pickString(nested.topic)
    || pickString(nested.mqttTopic)
    || pickString(nested.topicName)
    || '';
  const payloadSource =
    nested.payload
    ?? nested.message
    ?? nested.Message
    ?? nested.data
    ?? root.payload
    ?? root.message;
  const payload = decodePayload(payloadSource);
  const requestId =
    pickString(root.requestId)
    || pickString(nested.requestId)
    || pickString(asRecord(payload.meta).requestId)
    || '';
  const receivedAt =
    pickNumber(root.timestamp)
    ?? pickNumber(nested.timestamp)
    ?? pickNumber(asRecord(payload.meta).timestamp)
    ?? Date.now();

  if (!topic) {
    throw new Error('IoT queue message missing topic');
  }

  return {
    vendor: fallbackVendor,
    topic,
    payload,
    requestId: requestId || buildFallbackRequestId(topic, receivedAt),
    receivedAt,
  };
}

export function normalizeTopicPayloadBody(
  body: unknown,
  fallbackVendor: 'aws',
): NormalizedCloudIotIngressMessage {
  const record = asRecord(body);
  const topic =
    pickString(record.topic)
    || pickString(record.mqttTopic)
    || pickString(record.topicName)
    || '';
  if (!topic) {
    throw new Error('topic is required');
  }

  const payloadSource = record.payload ?? record.message ?? record.data ?? record;
  const payload = decodePayload(payloadSource);
  const receivedAt =
    pickNumber(record.receivedAt)
    ?? pickNumber(record.received_at)
    ?? pickNumber(record.timestamp)
    ?? pickNumber(asRecord(payload.meta).timestamp)
    ?? Date.now();
  const requestId =
    pickString(record.requestId)
    || pickString(record.request_id)
    || pickString(record.traceId)
    || pickString(asRecord(payload.meta).requestId)
    || buildFallbackRequestId(topic, receivedAt);

  return {
    vendor: fallbackVendor,
    topic,
    payload,
    requestId,
    receivedAt,
  };
}

function buildFallbackRequestId(topic: string, receivedAt: number): string {
  return `${receivedAt}:${topic}`;
}

function unwrapNestedRecord(record: Record<string, unknown>): Record<string, unknown> {
  const body = record.body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  const message = record.Message;
  if (typeof message === 'string') {
    try {
      const parsed = JSON.parse(message) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return record;
    }
  }
  return record;
}

function decodePayload(source: unknown): Record<string, unknown> {
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    return source as Record<string, unknown>;
  }
  if (typeof source === 'string' && source.trim()) {
    try {
      const parsed = JSON.parse(source) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return { raw: source };
    }
  }
  return {};
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function pickNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
