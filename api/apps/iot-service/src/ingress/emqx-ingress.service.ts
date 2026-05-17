import crypto from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { getEnvString, shouldRejectEmqxHttpStyleUplinkIngest } from '@lumimax/config';
import { createIotEmqxQueueHttpIngestDisabledException, getIotAccessErrorByReason } from '@lumimax/contracts';
import { EmqxIngressAdapterService, isBrokerDownlinkClientId } from '@lumimax/iot-kit';
import { AppLogger } from '@lumimax/logger';
import type { IotDeviceAccessPort, DeviceMqttAction } from './iot-device-access.port';
import { IOT_DEVICE_ACCESS } from './iot-device-access.port';
import type { IotMessagePublisherPort } from '../transport/iot-message-publisher.port';
import { IOT_MESSAGE_PUBLISHER } from '../transport/iot-message-publisher.port';

@Injectable()
export class EmqxIngressService {
  constructor(
    @Inject(IOT_DEVICE_ACCESS)
    private readonly deviceAccessValidationService: IotDeviceAccessPort,
    @Inject(AppLogger)
    private readonly logger: AppLogger,
    @Inject(IOT_MESSAGE_PUBLISHER)
    private readonly iotMessagePublisher: IotMessagePublisherPort,
    @Inject(EmqxIngressAdapterService)
    private readonly emqxIngressAdapterService: EmqxIngressAdapterService,
  ) {}

  async authenticate(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const clientId = pickString(body.clientid) ?? pickString(body.clientId) ?? '';
    const username = pickString(body.username);
    const requestId = resolveRequestId(body);

    if (verifyBrokerDownlinkMqttAuth(body, clientId, username)) {
      this.logger.debug(
        '已放行 biz-service 下行 MQTT 客户端的 EMQX 鉴权请求',
        { requestId, idLabel: 'ReqId', clientId },
        EmqxIngressService.name,
      );
      return {
        result: 'allow',
        is_superuser: true,
        client_attrs: {},
      };
    }

    const requestedDeviceId = pickString(body.deviceId) ?? username ?? clientId;
    const certificateFingerprint = pickCertificateFingerprint(body);
    const credentialId = pickCredentialId(body);
    const decision = await this.deviceAccessValidationService.validateAuthentication({
      clientId,
      deviceId: requestedDeviceId,
      tenantId: pickString(body.tenantId) ?? pickString(body.tenant_id),
      vendor: 'emqx',
      certificateFingerprint,
      credentialId,
    });
    if (!decision.allowed) {
      const businessError = getIotAccessErrorByReason(decision.reason);
      this.logger.warn(
        `EMQX 鉴权已拒绝：${decision.reason ?? 'unknown'}`,
        {
          requestId,
          idLabel: 'ReqId',
          clientId,
          requestedDeviceId,
          tenantId: pickString(body.tenantId) ?? pickString(body.tenant_id) ?? null,
          reason: decision.reason ?? 'unknown',
          businessCode: businessError?.code ?? null,
          businessKey: businessError?.key ?? null,
          resolvedDeviceId: decision.deviceId,
          resolvedTenantId: decision.tenantId,
          deviceStatus: decision.deviceStatus ?? null,
          credentialStatus: decision.credentialStatus ?? null,
          credentialId,
          certificateFingerprint,
        },
        EmqxIngressService.name,
      );
    }
    return {
      result: decision.allowed ? 'allow' : 'deny',
      is_superuser: false,
      client_attrs: toClientAttrs({
        deviceId: decision.deviceId,
        tenantId: decision.tenantId,
        deviceStatus: decision.deviceStatus,
        credentialStatus: decision.credentialStatus,
      }),
    };
  }

  async authorize(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const clientId = pickString(body.clientid) ?? pickString(body.clientId) ?? '';
    const username = pickString(body.username);
    const requestId = resolveRequestId(body);

    const action = normalizeAction(body.action ?? body.access ?? body.permission);
    const topic = pickString(body.topic);

    const isInternalServiceClient = isBrokerDownlinkClientId(clientId)
      || isBrokerDownlinkX509Client({ body, clientId, username });
    if (isInternalServiceClient) {
      const allowed = isAllowedIotServiceAcl({
        body,
        clientId,
        username,
        action,
        topic,
      });
      if (!allowed) {
        return {
          result: 'deny',
          is_superuser: false,
          client_attrs: {},
        };
      }
      return {
        result: 'allow',
        is_superuser: false,
        client_attrs: {},
      };
    }

    const requestedDeviceId = pickString(body.deviceId) ?? username ?? clientId;
    const certificateFingerprint = pickCertificateFingerprint(body);
    const credentialId = pickCredentialId(body);
    if (!action || !topic) {
      const reason = !action ? 'invalid_action' : 'missing_topic';
      const businessError = getIotAccessErrorByReason(reason);
      this.logger.warn(
        `EMQX ACL 在校验前已拒绝：${reason}`,
        {
          requestId,
          idLabel: 'ReqId',
          clientId,
          requestedDeviceId,
          topic: topic ?? null,
          action: action ?? null,
          reason,
          businessCode: businessError?.code ?? null,
          businessKey: businessError?.key ?? null,
        },
        EmqxIngressService.name,
      );
      return {
        result: 'deny',
        is_superuser: false,
      };
    }

    const decision = await this.deviceAccessValidationService.validateTopicAccess({
      clientId,
      deviceId: requestedDeviceId,
      tenantId: pickString(body.tenantId) ?? pickString(body.tenant_id),
      vendor: 'emqx',
      certificateFingerprint,
      credentialId,
      action,
      topic,
    });
    if (!decision.allowed) {
      const businessError = getIotAccessErrorByReason(decision.reason);
      this.logger.warn(
        `EMQX ACL 已拒绝：${decision.reason ?? 'unknown'}`,
        {
          requestId,
          idLabel: 'ReqId',
          clientId,
          requestedDeviceId,
          tenantId: pickString(body.tenantId) ?? pickString(body.tenant_id) ?? null,
          topic,
          action,
          reason: decision.reason ?? 'unknown',
          businessCode: businessError?.code ?? null,
          businessKey: businessError?.key ?? null,
          resolvedDeviceId: decision.deviceId,
          resolvedTenantId: decision.tenantId,
          topicKind: decision.topicKind ?? null,
          topicDirection: decision.topicDirection ?? null,
          deviceStatus: decision.deviceStatus ?? null,
          credentialStatus: decision.credentialStatus ?? null,
          credentialId,
          certificateFingerprint,
        },
        EmqxIngressService.name,
      );
    }
    return {
      result: decision.allowed ? 'allow' : 'deny',
      is_superuser: false,
      client_attrs: toClientAttrs({
        deviceId: decision.deviceId,
        tenantId: decision.tenantId,
        topicKind: decision.topicKind,
        topicDirection: decision.topicDirection,
      }),
    };
  }

  async ingest(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (shouldRejectEmqxHttpStyleUplinkIngest()) {
      throw createIotEmqxQueueHttpIngestDisabledException();
    }
    const normalized = this.emqxIngressAdapterService.normalize({
      channel: 'ingest',
      body,
    });
    await this.iotMessagePublisher.publishUplink({
      vendor: normalized.vendor,
      topic: normalized.topic,
      payload: normalized.payload,
      receivedAt: normalized.receivedAt,
      requestId: normalized.requestId,
    });
    return {
      ok: true,
      requestId: normalized.requestId,
      topic: normalized.topic,
      success: true,
      message: '已入队',
      queued: true,
    };
  }

  async webhook(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.ingest({
      ...this.emqxIngressAdapterService.normalize({
        channel: 'webhook',
        body,
      }),
    });
  }
}

function toClientAttrs(input: Record<string, string | null | undefined>): Record<string, string> {
  const entries = Object.entries(input).filter((entry): entry is [string, string] => {
    const [, value] = entry;
    return typeof value === 'string' && value.trim().length > 0;
  });
  return Object.fromEntries(entries);
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
  return 'unknown';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * iot-service 的共享订阅消费者与 EMQX MQTT 下行发布都会使用 `lumimax-iot-service-*`
 * 形式的 client id，并可选携带 `EMQX_MQTT_USERNAME` / `EMQX_MQTT_PASSWORD`。
 * EMQX HTTP 鉴权必须放行这类身份，避免把平台侧连接误判为设备连接。
 */
function verifyBrokerDownlinkMqttAuth(
  body: Record<string, unknown>,
  clientId: string,
  username: string | undefined,
): boolean {
  if (!isBrokerDownlinkClientId(clientId)) {
    return false;
  }
  const expectedPassword = pickString(getEnvString('EMQX_MQTT_PASSWORD'));
  if (!expectedPassword) {
    return false;
  }
  const wirePassword = typeof body.password === 'string' ? body.password : '';
  if (!timingSafeEqualUtf8(expectedPassword, wirePassword)) {
    return false;
  }
  const expectedUser = pickString(getEnvString('EMQX_MQTT_USERNAME'));
  if (expectedUser) {
    return username === expectedUser;
  }
  return username === undefined;
}

function isBrokerDownlinkX509Client(input: {
  body: Record<string, unknown>;
  clientId: string;
  username: string | undefined;
}): boolean {
  const expectedUser = resolveInternalServiceUsername();
  if (!expectedUser) {
    return false;
  }
  if (input.username !== expectedUser) {
    return false;
  }
  return true;
}

function resolveInternalServiceUsername(): string | undefined {
  return pickString(getEnvString('EMQX_MQTT_USERNAME', 'lumimax_iot'));
}

function isAllowedIotServiceAcl(input: {
  body?: Record<string, unknown>;
  clientId: string;
  username: string | undefined;
  action: DeviceMqttAction | null;
  topic: string | undefined;
}): boolean {
  const isLegacyClientId = isBrokerDownlinkClientId(input.clientId);
  const isX509Client = Boolean(
    input.body
    && isBrokerDownlinkX509Client({
      body: input.body,
      clientId: input.clientId,
      username: input.username,
    }),
  );
  if (!isLegacyClientId && !isX509Client) {
    return false;
  }
  if (!input.action || !input.topic) {
    return false;
  }
  if (input.action === 'subscribe') {
    return matchesSharedSubscriptionTopic(input.topic, { allowBareTopic: isX509Client });
  }
  if (input.action === 'publish') {
    return matchesDownstreamResponseTopic(input.topic);
  }
  return false;
}

function matchesSharedSubscriptionTopic(
  topic: string,
  options: { allowBareTopic: boolean },
): boolean {
  const group = pickString(getEnvString('EMQX_SHARED_SUBSCRIPTION_GROUP')) ?? 'lumimax-iot';
  const expectedPrefix = `$share/${group}/`;
  if (topic.startsWith(expectedPrefix)) {
    return matchesTopicPattern(topic.slice(expectedPrefix.length), 'v1/+/+/req');
  }
  if (!options.allowBareTopic) {
    return false;
  }
  return matchesTopicPattern(topic, 'v1/+/+/req');
}

function matchesDownstreamResponseTopic(topic: string): boolean {
  return matchesTopicPattern(topic, 'v1/+/+/res');
}

function matchesTopicPattern(topic: string, pattern: string): boolean {
  const topicParts = topic.split('/');
  const patternParts = pattern.split('/');
  if (topicParts.length !== patternParts.length) {
    return false;
  }
  return patternParts.every((part, index) => part === '+' || part === topicParts[index]);
}

function timingSafeEqualUtf8(expected: string, actual: string): boolean {
  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(actual, 'utf8');
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
