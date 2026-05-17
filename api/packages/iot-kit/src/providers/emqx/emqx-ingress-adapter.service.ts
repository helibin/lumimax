import { Injectable } from '@nestjs/common';
import { generateId } from '@lumimax/runtime';
import type {
  IotIngressAdapter,
  IotIngressChannel,
  NormalizedCloudIotIngressMessage,
} from '../../interfaces/iot-ingress-adapter.interface';

@Injectable()
export class EmqxIngressAdapterService implements IotIngressAdapter {
  readonly vendor = 'emqx' as const;

  supports(channel: IotIngressChannel): boolean {
    return channel === 'ingest' || channel === 'webhook';
  }

  normalize(input: { channel: IotIngressChannel; body: unknown }): NormalizedCloudIotIngressMessage {
    const body = asRecord(input.body);
    if (input.channel === 'ingest') {
      return normalizeIngestBody(body);
    }
    if (input.channel === 'webhook') {
      return normalizeWebhookBody(body);
    }
    throw new Error(`Unsupported EMQX ingress channel: ${input.channel}`);
  }
}

function normalizeIngestBody(body: Record<string, unknown>): NormalizedCloudIotIngressMessage {
  const topic = pickString(body.topic);
  if (!topic) {
    throw new Error('topic is required');
  }
  const payload = extractIngressPayload(body);
  const requestId = resolveRequestId(body, payload);
  const receivedAt = pickTimestamp(body) ?? pickTimestamp(payload) ?? Date.now();
  return {
    vendor: 'emqx',
    topic,
    payload,
    requestId,
    receivedAt,
  };
}

function normalizeWebhookBody(body: Record<string, unknown>): NormalizedCloudIotIngressMessage {
  const event = pickString(body.event) ?? pickString(body.action) ?? pickString(body.eventType);
  const clientId =
    pickString(body.clientid)
    ?? pickString(body.clientId)
    ?? pickString(asRecord(body.client).clientid)
    ?? pickString(asRecord(body.client).clientId)
    ?? pickString(body.deviceId);
  const payload = buildWebhookPayload(body, event, clientId);
  const topic =
    pickString(body.topic)
    ?? pickString(asRecord(body.message).topic)
    ?? buildLifecycleTopic(event, clientId);
  if (!topic) {
    throw new Error('topic is required');
  }
  const requestId = resolveRequestId(body, payload);
  const receivedAt = pickTimestamp(body) ?? pickTimestamp(payload) ?? Date.now();
  return {
    vendor: 'emqx',
    topic,
    payload,
    requestId,
    receivedAt,
  };
}

function extractIngressPayload(body: Record<string, unknown>): Record<string, unknown> {
  const directPayload = body.payload;
  if (directPayload !== undefined) {
    return coercePayloadRecord(directPayload, pickPayloadEncoding(body));
  }
  const message = asRecord(body.message);
  if (message.payload !== undefined) {
    return coercePayloadRecord(message.payload, pickPayloadEncoding(message));
  }
  return body;
}

function buildWebhookPayload(
  body: Record<string, unknown>,
  event: string | undefined,
  clientId: string | undefined,
): Record<string, unknown> {
  const payload = extractIngressPayload(body);
  const timestamp = pickTimestamp(body) ?? pickTimestamp(payload);
  return {
    ...payload,
    ...(event ? { event } : {}),
    ...(clientId ? { clientid: clientId } : {}),
    ...(timestamp ? { timestamp } : {}),
  };
}

function coercePayloadRecord(value: unknown, encoding?: string): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  const decoded = decodePayloadText(value, encoding);
  if (!decoded) {
    return {};
  }
  try {
    const parsed = JSON.parse(decoded) as unknown;
    return asRecord(parsed);
  } catch {
    return { raw: decoded };
  }
}

function decodePayloadText(value: unknown, encoding?: string): string {
  if (typeof value !== 'string') {
    return '';
  }
  if (encoding?.toLowerCase() === 'base64') {
    return Buffer.from(value, 'base64').toString('utf8');
  }
  return value;
}

function pickPayloadEncoding(body: Record<string, unknown>): string | undefined {
  return pickString(body.payload_encoding) ?? pickString(body.payloadEncoding) ?? pickString(body.encoding);
}

function buildLifecycleTopic(event: string | undefined, clientId: string | undefined): string {
  const normalizedEvent = String(event ?? '').trim().toLowerCase();
  const normalizedClientId = String(clientId ?? '').trim().toLowerCase();
  if (!normalizedEvent || !normalizedClientId) {
    return '';
  }
  return `emqx/${normalizedEvent}/${normalizedClientId}`;
}

function resolveRequestId(...sources: Array<Record<string, unknown>>): string {
  for (const source of sources) {
    const requestId =
      pickString(source.requestId)
      ?? pickString(source.request_id)
      ?? pickString(source.traceId)
      ?? pickString(source.id)
      ?? pickString(asRecord(source.meta).requestId);
    if (requestId) {
      return requestId;
    }
  }
  return generateId();
}

function pickTimestamp(source: Record<string, unknown>): number | undefined {
  const candidates = [
    source.receivedAt,
    source.received_at,
    source.timestamp,
    source.ts,
    source.publish_received_at,
    source.connected_at,
    source.disconnected_at,
    asRecord(source.meta).timestamp,
  ];
  for (const candidate of candidates) {
    const parsed = toNumber(candidate);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
