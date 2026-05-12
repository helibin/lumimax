import { Inject, Injectable } from '@nestjs/common';
import { generateId } from '@lumimax/runtime';
import { DeviceAccessValidationService, type DeviceMqttAction } from '../../device/devices/device-access-validation.service';
import { IotApplicationService } from './iot-application.service';

@Injectable()
export class EmqxIngressService {
  constructor(
    @Inject(DeviceAccessValidationService)
    private readonly deviceAccessValidationService: DeviceAccessValidationService,
    @Inject(IotApplicationService)
    private readonly iotApplicationService: IotApplicationService,
  ) {}

  async authenticate(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const clientId = pickString(body.clientid) ?? pickString(body.clientId) ?? '';
    const username = pickString(body.username);
    const decision = await this.deviceAccessValidationService.validateAuthentication({
      clientId,
      deviceId: pickString(body.deviceId) ?? username ?? clientId,
      tenantId: pickString(body.tenantId) ?? pickString(body.tenant_id),
      vendor: 'emqx',
      certificateFingerprint: pickCertificateFingerprint(body),
      credentialId: pickCredentialId(body),
    });
    return {
      result: decision.allowed ? 'allow' : 'deny',
      is_superuser: false,
      anonymous: false,
      requestId: resolveRequestId(body),
      reason: decision.reason ?? null,
      client_attrs: {
        deviceId: decision.deviceId,
        tenantId: decision.tenantId,
        deviceStatus: decision.deviceStatus ?? null,
        credentialStatus: decision.credentialStatus ?? null,
      },
    };
  }

  async authorize(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const clientId = pickString(body.clientid) ?? pickString(body.clientId) ?? '';
    const username = pickString(body.username);
    const action = normalizeAction(body.action ?? body.access ?? body.permission);
    const topic = pickString(body.topic);
    if (!action || !topic) {
      return {
        result: 'deny',
        is_superuser: false,
        anonymous: false,
        requestId: resolveRequestId(body),
        reason: !action ? 'invalid_action' : 'missing_topic',
      };
    }

    const decision = await this.deviceAccessValidationService.validateTopicAccess({
      clientId,
      deviceId: pickString(body.deviceId) ?? username ?? clientId,
      tenantId: pickString(body.tenantId) ?? pickString(body.tenant_id),
      vendor: 'emqx',
      certificateFingerprint: pickCertificateFingerprint(body),
      credentialId: pickCredentialId(body),
      action,
      topic,
    });
    return {
      result: decision.allowed ? 'allow' : 'deny',
      is_superuser: false,
      anonymous: false,
      requestId: resolveRequestId(body),
      reason: decision.reason ?? null,
      topic,
      action,
      client_attrs: {
        deviceId: decision.deviceId,
        tenantId: decision.tenantId,
        topicKind: decision.topicKind ?? null,
        topicDirection: decision.topicDirection ?? null,
      },
    };
  }

  async ingest(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const topic = pickString(body.topic);
    if (!topic) {
      throw new Error('topic is required');
    }
    const payload = extractIngressPayload(body);
    const requestId = resolveRequestId(body, payload);
    const receivedAt = pickTimestamp(body) ?? pickTimestamp(payload) ?? Date.now();
    const result = await this.iotApplicationService.ingestCloudMessage({
      vendor: 'emqx',
      topic,
      payloadJson: JSON.stringify(payload),
      receivedAt,
      requestId,
    });
    return {
      ok: true,
      requestId,
      topic,
      ...result,
    };
  }

  async webhook(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const event = pickString(body.event) ?? pickString(body.action) ?? pickString(body.eventType);
    const clientId =
      pickString(body.clientid)
      ?? pickString(body.clientId)
      ?? pickString(asRecord(body.client).clientid)
      ?? pickString(asRecord(body.client).clientId)
      ?? pickString(body.deviceId);
    const topic =
      pickString(body.topic)
      ?? pickString(asRecord(body.message).topic)
      ?? buildLifecycleTopic(event, clientId);
    if (!topic) {
      throw new Error('topic is required');
    }
    const payload = buildWebhookPayload(body, event, clientId);
    return this.ingest({
      requestId: resolveRequestId(body, payload),
      topic,
      receivedAt: pickTimestamp(body) ?? pickTimestamp(payload) ?? Date.now(),
      payload,
    });
  }
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

function pickCertificateFingerprint(body: Record<string, unknown>): string | undefined {
  const certInfo = asRecord(body.cert_info);
  return (
    pickString(body.cert_fingerprint)
    ?? pickString(body.certFingerprint)
    ?? pickString(body.peer_cert_fingerprint)
    ?? pickString(certInfo.fingerprint)
  );
}

function pickCredentialId(body: Record<string, unknown>): string | undefined {
  const certInfo = asRecord(body.cert_info);
  return (
    pickString(body.credentialId)
    ?? pickString(body.cert_serial_number)
    ?? pickString(body.certSerialNumber)
    ?? pickString(certInfo.serial_number)
  );
}

function buildLifecycleTopic(event: string | undefined, clientId: string | undefined): string {
  const normalizedEvent = String(event ?? '').trim().toLowerCase();
  const normalizedClientId = String(clientId ?? '').trim().toLowerCase();
  if (!normalizedEvent || !normalizedClientId) {
    return '';
  }
  return `emqx/${normalizedEvent}/${normalizedClientId}`;
}

function normalizeAction(value: unknown): DeviceMqttAction | null {
  if (typeof value === 'number') {
    if (value === 1) {
      return 'subscribe';
    }
    if (value === 2) {
      return 'publish';
    }
  }
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['publish', 'pub', '2'].includes(normalized)) {
    return 'publish';
  }
  if (['subscribe', 'sub', '1'].includes(normalized)) {
    return 'subscribe';
  }
  return null;
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
