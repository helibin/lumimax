import type { ConsumerDeserializer } from '@nestjs/microservices';
import { IncomingRequestDeserializer } from '@nestjs/microservices/deserializers/incoming-request.deserializer';
import { generateId } from '@lumimax/runtime';
import {
  IOT_BRIDGE_DOWNSTREAM_PUBLISH_EVENT,
  resolveIotBridgeEventPattern,
} from './iot-bridge.rabbitmq';

/**
 * EMQX（以及其他外部发布方）经常直接往 `lumimax.bus` 发送扁平 JSON，
 * 而不是 Nest 期望的 `{ pattern, data }` 包装结构。默认的
 * {@link IncomingRequestDeserializer} 会尝试从 `options.channel` 推断 `pattern`，
 * 但 RabbitMQ 并不会提供这个值，于是就会出现 `Pattern: undefined`
 * 和 `RQM_NO_EVENT_HANDLER`。
 *
 * 这个反序列化器会先把扁平的上行消息 / 下行命令包装成 Nest 能识别的结构，
 * 再交给默认反序列化逻辑继续处理。
 */
export class IotBridgeIncomingDeserializer implements ConsumerDeserializer {
  private readonly nest = new IncomingRequestDeserializer();

  deserialize(value: unknown, options?: Record<string, unknown>) {
    return this.nest.deserialize(this.normalizeFlatBridgePayload(value), options);
  }

  private normalizeFlatBridgePayload(value: unknown): unknown {
    if (!value || typeof value !== 'object') {
      return value;
    }
    const v = value as Record<string, unknown>;
    if (typeof v.pattern === 'string' && 'data' in v) {
      const nested = unwrapRabbitMqBusinessEnvelope(v.data, v.pattern);
      if (nested) {
        return {
          pattern: v.pattern,
          data: nested,
        };
      }
      return value;
    }
    if (typeof v.eventName === 'string' && 'data' in v) {
      return {
        pattern: v.eventName,
        data: v.data,
      };
    }
    if (
      typeof v.topic === 'string'
      && typeof v.vendor === 'string'
      && typeof v.requestId === 'string'
      && typeof v.receivedAt === 'number'
    ) {
      const pattern = resolveIotBridgeEventPattern(v.topic);
      return { pattern, data: value };
    }
    if (
      typeof v.deviceId === 'string'
      && typeof v.topic === 'string'
      && typeof v.requestId === 'string'
      && (typeof v.provider === 'string' || typeof v.vendor === 'string')
    ) {
      return { pattern: IOT_BRIDGE_DOWNSTREAM_PUBLISH_EVENT, data: value };
    }
    if (
      typeof v.deviceId === 'string'
      && typeof v.topic === 'string'
      && typeof v.vendor === 'string'
      && typeof v.requestId === 'string'
    ) {
      return { pattern: IOT_BRIDGE_DOWNSTREAM_PUBLISH_EVENT, data: value };
    }
    const rawEmqxPayload = this.normalizeRawEmqxIngress(v);
    if (rawEmqxPayload) {
      return rawEmqxPayload;
    }
    return value;
  }

  private normalizeRawEmqxIngress(
    value: Record<string, unknown>,
  ): { pattern: string; data: unknown } | null {
    if (!looksLikeEmqxIngressPayload(value)) {
      return null;
    }

    const normalized = normalizeEmqxIngressPayload(value);
    return {
      pattern: resolveIotBridgeEventPattern(normalized.topic),
      data: normalized,
    };
  }
}

function unwrapRabbitMqBusinessEnvelope(value: unknown, pattern?: string): unknown | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.eventName !== 'string' || !('data' in record)) {
    return null;
  }
  if (pattern && record.eventName !== pattern) {
    return null;
  }
  return record.data;
}

function looksLikeEmqxIngressPayload(value: Record<string, unknown>): boolean {
  return (
    typeof value.topic === 'string'
    || typeof value.event === 'string'
    || typeof value.action === 'string'
    || typeof value.eventType === 'string'
    || typeof value.clientid === 'string'
    || typeof value.clientId === 'string'
  );
}

function inferEmqxIngressChannel(value: Record<string, unknown>): 'ingest' | 'webhook' {
  if (
    typeof value.event === 'string'
    || typeof value.action === 'string'
    || typeof value.eventType === 'string'
  ) {
    return 'webhook';
  }
  return 'ingest';
}

function normalizeEmqxIngressPayload(value: Record<string, unknown>): {
  vendor: 'emqx';
  topic: string;
  payload: Record<string, unknown>;
  requestId: string;
  receivedAt: number;
} {
  const channel = inferEmqxIngressChannel(value);
  const payload =
    channel === 'webhook' ? buildWebhookPayload(value) : extractIngressPayload(value);
  const topic =
    pickString(value.topic)
    ?? pickString(asRecord(value.message).topic)
    ?? buildLifecycleTopic(
      pickString(value.event) ?? pickString(value.action) ?? pickString(value.eventType),
      pickString(value.clientid)
        ?? pickString(value.clientId)
        ?? pickString(asRecord(value.client).clientid)
        ?? pickString(asRecord(value.client).clientId)
        ?? pickString(value.deviceId),
    );
  if (!topic) {
    throw new Error('topic is required');
  }
  return {
    vendor: 'emqx',
    topic,
    payload,
    requestId: resolveRequestId(value, payload),
    receivedAt: pickTimestamp(value) ?? pickTimestamp(payload) ?? Date.now(),
  };
}

function extractIngressPayload(body: Record<string, unknown>): Record<string, unknown> {
  if (body.payload !== undefined) {
    return coercePayloadRecord(body.payload, pickPayloadEncoding(body));
  }
  const message = asRecord(body.message);
  if (message.payload !== undefined) {
    return coercePayloadRecord(message.payload, pickPayloadEncoding(message));
  }
  return body;
}

function buildWebhookPayload(body: Record<string, unknown>): Record<string, unknown> {
  const event = pickString(body.event) ?? pickString(body.action) ?? pickString(body.eventType);
  const clientId =
    pickString(body.clientid)
    ?? pickString(body.clientId)
    ?? pickString(asRecord(body.client).clientid)
    ?? pickString(asRecord(body.client).clientId)
    ?? pickString(body.deviceId);
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
    return asRecord(JSON.parse(decoded) as unknown);
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
