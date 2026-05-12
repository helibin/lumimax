import crypto from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { getDefaultLocale } from '../../config/default-locale';
import { IotTopicService } from '../bridge/iot-topic.service';
import {
  BizIotTopicKind,
  type CloudIotVendorName,
  type IncomingBizIotMessage,
  type NormalizedBizIotMessage,
} from '../iot.types';
import { IotEnvelopeService } from './iot-envelope.service';

@Injectable()
export class IotNormalizerService {
  constructor(
    @Inject(IotTopicService) private readonly topicService: IotTopicService,
    @Inject(IotEnvelopeService) private readonly iotEnvelopeService: IotEnvelopeService,
  ) {}

  normalize(input: IncomingBizIotMessage): NormalizedBizIotMessage {
    try {
      const parsedTopic = this.topicService.parse(input.topic);
      const decoded = this.iotEnvelopeService.validate<Record<string, unknown>>(
        input.payload as Buffer | string | Record<string, unknown>,
      );
      if (parsedTopic.deviceId !== decoded.meta.deviceId) {
        throw new Error('topic 中的 deviceId 与 payload.meta.deviceId 不一致');
      }
      assertEventMatchesTopicKind(parsedTopic.kind, decoded.meta.event);
      return {
        vendor: input.vendor,
        topic: input.topic,
        deviceId: parsedTopic.deviceId,
        topicKind: parsedTopic.kind,
        requestId: decoded.meta.requestId,
        event: decoded.meta.event,
        locale: decoded.meta.locale,
        payload: decoded.data,
        timestamp: decoded.meta.timestamp,
        receivedAt: new Date(input.receivedAt ?? Date.now()),
      };
    } catch (error) {
      const lifecycle = tryNormalizeCloudLifecycle(input);
      if (lifecycle) {
        return lifecycle;
      }
      if (error instanceof Error && error.message) {
        throw error;
      }
      throw new Error(`不支持的 IoT 消息格式 topic=${input.topic}`);
    }
  }
}

function tryNormalizeCloudLifecycle(
  input: IncomingBizIotMessage,
): NormalizedBizIotMessage | null {
  if (input.vendor === 'aliyun') {
    return tryNormalizeAliyunLifecycle(input);
  }
  if (input.vendor === 'emqx') {
    return tryNormalizeEmqxLifecycle(input);
  }
  return tryNormalizeAwsLifecycle(input);
}

function assertEventMatchesTopicKind(kind: BizIotTopicKind, event: string): void {
  const normalizedEvent = event.trim().toLowerCase();
  const isResultEvent = normalizedEvent.endsWith('.result');
  const isCmdReplyEvent =
    normalizedEvent.endsWith('.accepted')
    || normalizedEvent.endsWith('.progress')
    || normalizedEvent.endsWith('.response')
    || isResultEvent;

  switch (kind) {
    case BizIotTopicKind.CONNECT_REQ:
      if (normalizedEvent !== 'connect.register') {
        throw new Error(`event ${event} 与 topic 类型 ${kind} 不匹配`);
      }
      return;
    case BizIotTopicKind.CONNECT_RES:
      if (normalizedEvent !== 'connect.register.result') {
        throw new Error(`event ${event} 与 topic 类型 ${kind} 不匹配`);
      }
      return;
    case BizIotTopicKind.STATUS_REQ:
      if (!normalizedEvent.startsWith('status.')) {
        throw new Error(`event ${event} 与 topic 类型 ${kind} 不匹配`);
      }
      return;
    case BizIotTopicKind.EVENT_REQ:
      if (startsWithReservedChannel(normalizedEvent) || isResultEvent) {
        throw new Error(`event ${event} 与 topic 类型 ${kind} 不匹配`);
      }
      return;
    case BizIotTopicKind.EVENT_RES:
      if (startsWithReservedChannel(normalizedEvent) || !isResultEvent) {
        throw new Error(`event ${event} 与 topic 类型 ${kind} 不匹配`);
      }
      return;
    case BizIotTopicKind.ATTR_REQ:
      if (!normalizedEvent.startsWith('attr.') || !isResultEvent) {
        throw new Error(`event ${event} 与 topic 类型 ${kind} 不匹配`);
      }
      return;
    case BizIotTopicKind.ATTR_RES:
      if (!normalizedEvent.startsWith('attr.') || isResultEvent) {
        throw new Error(`event ${event} 与 topic 类型 ${kind} 不匹配`);
      }
      return;
    case BizIotTopicKind.CMD_REQ:
      if (!normalizedEvent.startsWith('cmd.') || !isCmdReplyEvent) {
        throw new Error(`event ${event} 与 topic 类型 ${kind} 不匹配`);
      }
      return;
    case BizIotTopicKind.CMD_RES:
      if (!normalizedEvent.startsWith('cmd.') || isCmdReplyEvent) {
        throw new Error(`event ${event} 与 topic 类型 ${kind} 不匹配`);
      }
      return;
  }
}

function startsWithReservedChannel(event: string): boolean {
  return (
    event.startsWith('connect.')
    || event.startsWith('status.')
    || event.startsWith('attr.')
    || event.startsWith('cmd.')
  );
}

function tryNormalizeAwsLifecycle(
  input: IncomingBizIotMessage,
): NormalizedBizIotMessage | null {
  const match = input.topic.match(/^\$aws\/events\/presence\/(connected|disconnected)\/(.+)$/);
  if (!match) {
    return null;
  }
  const lifecycle = match[1] === 'connected' ? 'connected' : 'disconnected';
  const clientId = match[2]?.trim();
  if (!clientId) {
    return null;
  }
  const payload = asRecord(input.payload);
  const timestamp =
    pickNumber(payload.timestamp)
    ?? pickNumber(payload.eventTimestamp)
    ?? input.receivedAt
    ?? Date.now();
  const requestId =
    pickString(payload.traceId)
    ?? pickString(payload.id)
    ?? buildLifecycleRequestId(input.vendor, lifecycle, clientId, timestamp);
  return {
    vendor: input.vendor,
    topic: input.topic,
    deviceId: clientId,
    topicKind: BizIotTopicKind.STATUS_REQ,
    requestId,
    event: `status.${lifecycle}`,
    locale: getDefaultLocale(),
    payload,
    timestamp,
    receivedAt: new Date(input.receivedAt ?? timestamp),
  };
}

function tryNormalizeAliyunLifecycle(
  input: IncomingBizIotMessage,
): NormalizedBizIotMessage | null {
  const payload = asRecord(input.payload);
  const topicParts = String(input.topic).split('/').filter(Boolean);
  const topicDeviceName =
    topicParts.length >= 4 && topicParts[0] === 'sys' ? topicParts[2]?.trim().toLowerCase() : '';
  const rawStatus =
    pickString(payload.status)
    ?? pickString(payload.deviceStatus)
    ?? pickString(asRecord(payload.items).status)
    ?? pickLifecycleFromEventType(pickString(payload.eventType))
    ?? pickLifecycleFromEventType(pickString(payload.type));
  const lifecycle = normalizeLifecycle(rawStatus);
  if (!lifecycle) {
    return null;
  }
  const deviceId =
    pickString(payload.deviceName)
    ?? pickString(payload.clientId)
    ?? pickString(payload.iotId)
    ?? topicDeviceName;
  if (!deviceId) {
    return null;
  }
  const timestamp =
    pickNumber(payload.timestamp)
    ?? pickNumber(payload.gmtCreate)
    ?? input.receivedAt
    ?? Date.now();
  const requestId =
    pickString(payload.traceId)
    ?? pickString(payload.id)
    ?? buildLifecycleRequestId(input.vendor, lifecycle, deviceId, timestamp);
  return {
    vendor: input.vendor,
    topic: input.topic,
    deviceId: deviceId.trim(),
    topicKind: BizIotTopicKind.STATUS_REQ,
    requestId,
    event: `status.${lifecycle}`,
    locale: getDefaultLocale(),
    payload,
    timestamp,
    receivedAt: new Date(input.receivedAt ?? timestamp),
  };
}

function tryNormalizeEmqxLifecycle(
  input: IncomingBizIotMessage,
): NormalizedBizIotMessage | null {
  const payload = asRecord(input.payload);
  const topic = String(input.topic ?? '').trim();
  const rawEvent =
    pickString(payload.event)
    ?? pickString(payload.action)
    ?? pickString(payload.eventType)
    ?? pickLifecycleFromEmqxTopic(topic);
  const lifecycle = normalizeLifecycleFromEmqx(rawEvent);
  if (!lifecycle) {
    return null;
  }
  const deviceId =
    pickString(payload.clientid)
    ?? pickString(payload.clientId)
    ?? pickString(payload.deviceId)
    ?? pickClientIdFromEmqxTopic(topic);
  if (!deviceId) {
    return null;
  }
  const timestamp =
    pickNumber(payload.timestamp)
    ?? pickNumber(payload.ts)
    ?? pickNumber(payload.connected_at)
    ?? pickNumber(payload.disconnected_at)
    ?? input.receivedAt
    ?? Date.now();
  const requestId =
    pickString(payload.traceId)
    ?? pickString(payload.id)
    ?? buildLifecycleRequestId(input.vendor, lifecycle, deviceId, timestamp);
  return {
    vendor: input.vendor,
    topic: input.topic,
    deviceId: deviceId.trim(),
    topicKind: BizIotTopicKind.STATUS_REQ,
    requestId,
    event: `status.${lifecycle}`,
    locale: getDefaultLocale(),
    payload,
    timestamp,
    receivedAt: new Date(input.receivedAt ?? timestamp),
  };
}

function normalizeLifecycle(value: string | undefined): 'connected' | 'disconnected' | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['connected', 'connect', 'online'].includes(normalized)) {
    return 'connected';
  }
  if (['disconnected', 'disconnect', 'offline'].includes(normalized)) {
    return 'disconnected';
  }
  return null;
}

function pickLifecycleFromEventType(value: string | undefined): string | undefined {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized.includes('connect') || normalized.includes('online')) {
    return normalized.includes('disconnect') || normalized.includes('offline')
      ? 'offline'
      : 'online';
  }
  return undefined;
}

function normalizeLifecycleFromEmqx(value: string | undefined): 'connected' | 'disconnected' | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (
    [
      'client.connected',
      'client_connected',
      'connected',
      'session.subscribed',
      'online',
    ].includes(normalized)
  ) {
    return 'connected';
  }
  if (
    [
      'client.disconnected',
      'client_disconnected',
      'disconnected',
      'offline',
    ].includes(normalized)
  ) {
    return 'disconnected';
  }
  return normalizeLifecycle(normalized);
}

function pickLifecycleFromEmqxTopic(topic: string): string | undefined {
  const normalized = topic.trim().toLowerCase();
  if (
    normalized.includes('client_connected')
    || normalized.endsWith('/connected')
  ) {
    return 'connected';
  }
  if (
    normalized.includes('client_disconnected')
    || normalized.endsWith('/disconnected')
  ) {
    return 'disconnected';
  }
  return undefined;
}

function pickClientIdFromEmqxTopic(topic: string): string | undefined {
  const parts = topic.split('/').filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }
  const connectedIndex = parts.findIndex((part) => ['connected', 'disconnected'].includes(part));
  if (connectedIndex > 0) {
    return parts[connectedIndex - 1];
  }
  const clientIndex = parts.findIndex((part) => part === 'clients');
  if (clientIndex >= 0 && parts[clientIndex + 1]) {
    return parts[clientIndex + 1];
  }
  return parts.at(-1);
}

function buildLifecycleRequestId(
  vendor: CloudIotVendorName,
  lifecycle: 'connected' | 'disconnected',
  clientId: string,
  timestamp: number,
): string {
  const raw = `${vendor}:${lifecycle}:${clientId}:${timestamp}`;
  if (raw.length <= 64) {
    return raw;
  }
  const digest = crypto.createHash('sha256').update(clientId).digest('hex').slice(0, 24);
  return `${vendor}:${lifecycle}:${digest}:${timestamp}`;
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
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
