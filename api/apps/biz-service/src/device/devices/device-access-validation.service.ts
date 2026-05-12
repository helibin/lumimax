import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { DeviceCredentialEntity, DeviceEntity } from '../../common/entities/biz.entities';
import { BizIotTopicKind } from '../../iot/iot.types';

export type DeviceMqttAction = 'publish' | 'subscribe';

export interface DeviceAccessAuthInput {
  clientId: string;
  deviceId?: string | null;
  tenantId?: string | null;
  vendor?: string | null;
  certificateFingerprint?: string | null;
  credentialId?: string | null;
}

export interface DeviceTopicAccessInput extends DeviceAccessAuthInput {
  action: DeviceMqttAction;
  topic: string;
}

export interface DeviceAccessDecision {
  allowed: boolean;
  deviceId: string | null;
  tenantId: string | null;
  reason?: string;
  deviceStatus?: string | null;
  credentialStatus?: string | null;
  credentialId?: string | null;
  fingerprint?: string | null;
}

export interface DeviceTopicAccessDecision extends DeviceAccessDecision {
  topic?: string;
  topicKind?: BizIotTopicKind;
  topicDirection?: 'req' | 'res';
  topicCategory?: 'connect' | 'status' | 'event' | 'attr' | 'cmd';
  action?: DeviceMqttAction;
}

type ParsedTopic = {
  version: 'v1';
  category: 'connect' | 'status' | 'event' | 'attr' | 'cmd';
  deviceId: string;
  direction: 'req' | 'res';
  kind: BizIotTopicKind;
};

@Injectable()
export class DeviceAccessValidationService {
  constructor(
    @InjectRepository(DeviceEntity)
    private readonly deviceRepository: Repository<DeviceEntity>,
    @InjectRepository(DeviceCredentialEntity)
    private readonly deviceCredentialRepository: Repository<DeviceCredentialEntity>,
  ) {}

  async validateAuthentication(input: DeviceAccessAuthInput): Promise<DeviceAccessDecision> {
    const clientId = normalizeIdentifier(input.clientId);
    const requestedDeviceId = normalizeOptionalIdentifier(input.deviceId);
    const fingerprint = normalizeFingerprint(input.certificateFingerprint);
    const credentialId = normalizeOptional(input.credentialId);
    const vendor = normalizeOptionalIdentifier(input.vendor);

    if (!clientId) {
      return deny('missing_client_id');
    }

    if (requestedDeviceId && requestedDeviceId !== clientId) {
      return deny('client_id_device_id_mismatch', clientId, input.tenantId ?? null);
    }

    const deviceId = requestedDeviceId ?? clientId;
    const tenantId = normalizeOptional(input.tenantId);
    const device = await this.findDevice(deviceId, tenantId);
    if (!device) {
      return deny('device_not_found', deviceId, tenantId);
    }

    if (normalizeIdentifier(device.id) !== clientId) {
      return deny('client_id_device_record_mismatch', device.id, device.tenantId, device.status);
    }

    if (vendor && normalizeIdentifier(device.provider) !== vendor) {
      return deny(
        'device_provider_mismatch',
        device.id,
        device.tenantId,
        device.status,
      );
    }

    if (!isDeviceActive(device.status)) {
      return deny('device_inactive', device.id, device.tenantId, device.status);
    }

    const credential = await this.findCredential({
      deviceId: device.id,
      tenantId: device.tenantId,
      vendor: vendor ?? normalizeIdentifier(device.provider),
      credentialId,
      fingerprint,
    });

    if (!credential) {
      return deny(
        fingerprint || credentialId ? 'credential_not_matched' : 'active_credential_not_found',
        device.id,
        device.tenantId,
        device.status,
      );
    }

    if (!isCredentialActive(credential.status)) {
      return deny(
        'credential_inactive',
        device.id,
        device.tenantId,
        device.status,
        credential.status,
        credential.credentialId ?? null,
        credential.fingerprint ?? null,
      );
    }

    if (fingerprint && normalizeFingerprint(credential.fingerprint) !== fingerprint) {
      return deny(
        'certificate_fingerprint_mismatch',
        device.id,
        device.tenantId,
        device.status,
        credential.status,
        credential.credentialId ?? null,
        credential.fingerprint ?? null,
      );
    }

    if (credentialId && normalizeOptional(credential.credentialId) !== credentialId) {
      return deny(
        'credential_id_mismatch',
        device.id,
        device.tenantId,
        device.status,
        credential.status,
        credential.credentialId ?? null,
        credential.fingerprint ?? null,
      );
    }

    return {
      allowed: true,
      deviceId: device.id,
      tenantId: device.tenantId,
      deviceStatus: device.status,
      credentialStatus: credential.status,
      credentialId: credential.credentialId ?? null,
      fingerprint: credential.fingerprint ?? null,
    };
  }

  private async findDevice(deviceId: string, tenantId: string | null): Promise<DeviceEntity | null> {
    const tenantScoped = tenantId
      ? await this.deviceRepository.findOne({
        where: [
          { tenantId, id: deviceId },
          { tenantId, deviceSn: deviceId },
        ],
      })
      : null;
    if (tenantScoped) {
      return tenantScoped;
    }
    return this.deviceRepository.findOne({
      where: [{ id: deviceId }, { deviceSn: deviceId }],
    });
  }

  async validateTopicAccess(input: DeviceTopicAccessInput): Promise<DeviceTopicAccessDecision> {
    const auth = await this.validateAuthentication(input);
    if (!auth.allowed || !auth.deviceId) {
      return {
        ...auth,
        topic: input.topic,
        action: input.action,
      };
    }

    let parsed: ParsedTopic;
    try {
      parsed = parseBizTopic(input.topic);
    } catch (error) {
      return {
        ...auth,
        allowed: false,
        topic: input.topic,
        action: input.action,
        reason: error instanceof Error && error.message ? error.message : 'invalid_topic',
      };
    }

    if (parsed.deviceId !== normalizeIdentifier(auth.deviceId)) {
      return {
        ...auth,
        allowed: false,
        topic: input.topic,
        action: input.action,
        topicKind: parsed.kind,
        topicCategory: parsed.category,
        topicDirection: parsed.direction,
        reason: 'topic_device_id_mismatch',
      };
    }

    if (!isTopicActionAllowed(input.action, parsed.kind)) {
      return {
        ...auth,
        allowed: false,
        topic: input.topic,
        action: input.action,
        topicKind: parsed.kind,
        topicCategory: parsed.category,
        topicDirection: parsed.direction,
        reason: 'topic_action_not_allowed',
      };
    }

    return {
      ...auth,
      allowed: true,
      topic: input.topic,
      action: input.action,
      topicKind: parsed.kind,
      topicCategory: parsed.category,
      topicDirection: parsed.direction,
    };
  }

  private async findCredential(input: {
    tenantId: string;
    deviceId: string;
    vendor: string;
    credentialId: string | null;
    fingerprint: string | null;
  }): Promise<DeviceCredentialEntity | null> {
    const where: Record<string, unknown> = {
      tenantId: input.tenantId,
      deviceId: input.deviceId,
    };
    if (input.vendor) {
      where.vendor = input.vendor;
    }
    if (input.credentialId) {
      where.credentialId = input.credentialId;
    }
    if (input.fingerprint) {
      where.fingerprint = input.fingerprint;
    }

    const matched = await this.deviceCredentialRepository.findOne({
      where,
      order: {
        issuedAt: 'DESC',
        createdAt: 'DESC',
      },
    });
    if (matched) {
      return matched;
    }

    if (input.credentialId || input.fingerprint) {
      return null;
    }

    return this.deviceCredentialRepository.findOne({
      where: {
        tenantId: input.tenantId,
        deviceId: input.deviceId,
        ...(input.vendor ? { vendor: input.vendor } : {}),
      },
      order: {
        issuedAt: 'DESC',
        createdAt: 'DESC',
      },
    });
  }
}

function parseBizTopic(topic: string): ParsedTopic {
  const parts = String(topic).split('/');
  if (parts.length !== 4) {
    throw new Error('invalid_topic');
  }
  const [version, category, rawDeviceId, direction] = parts;
  if (version !== 'v1') {
    throw new Error('unsupported_topic_version');
  }
  const deviceId = normalizeIdentifier(rawDeviceId);
  if (!deviceId) {
    throw new Error('missing_topic_device_id');
  }

  const normalizedCategory = category.trim();
  const normalizedDirection = direction.trim();
  const kind = TOPIC_KIND_LOOKUP[`${normalizedCategory}:${normalizedDirection}`];
  if (!kind) {
    throw new Error('unsupported_topic_kind');
  }

  return {
    version: 'v1',
    category: normalizedCategory as ParsedTopic['category'],
    deviceId,
    direction: normalizedDirection as ParsedTopic['direction'],
    kind,
  };
}

const TOPIC_KIND_LOOKUP: Record<string, BizIotTopicKind> = {
  'connect:req': BizIotTopicKind.CONNECT_REQ,
  'connect:res': BizIotTopicKind.CONNECT_RES,
  'status:req': BizIotTopicKind.STATUS_REQ,
  'event:req': BizIotTopicKind.EVENT_REQ,
  'event:res': BizIotTopicKind.EVENT_RES,
  'attr:req': BizIotTopicKind.ATTR_REQ,
  'attr:res': BizIotTopicKind.ATTR_RES,
  'cmd:req': BizIotTopicKind.CMD_REQ,
  'cmd:res': BizIotTopicKind.CMD_RES,
};

const PUBLISHABLE_KINDS = new Set<BizIotTopicKind>([
  BizIotTopicKind.CONNECT_REQ,
  BizIotTopicKind.STATUS_REQ,
  BizIotTopicKind.EVENT_REQ,
  BizIotTopicKind.ATTR_REQ,
  BizIotTopicKind.CMD_REQ,
]);

const SUBSCRIBABLE_KINDS = new Set<BizIotTopicKind>([
  BizIotTopicKind.CONNECT_RES,
  BizIotTopicKind.EVENT_RES,
  BizIotTopicKind.ATTR_RES,
  BizIotTopicKind.CMD_RES,
]);

function isTopicActionAllowed(action: DeviceMqttAction, kind: BizIotTopicKind): boolean {
  return action === 'publish' ? PUBLISHABLE_KINDS.has(kind) : SUBSCRIBABLE_KINDS.has(kind);
}

function isDeviceActive(status: string | null | undefined): boolean {
  return normalizeOptionalIdentifier(status) === 'active';
}

function isCredentialActive(status: string | null | undefined): boolean {
  const normalized = normalizeOptionalIdentifier(status);
  return normalized === 'active' || normalized === 'grace' || normalized === 'rotating';
}

function normalizeIdentifier(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeOptionalIdentifier(value: string | null | undefined): string | null {
  const normalized = normalizeIdentifier(value);
  return normalized || null;
}

function normalizeOptional(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeFingerprint(value: string | null | undefined): string | null {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replaceAll(':', '');
  return normalized || null;
}

function deny(
  reason: string,
  deviceId: string | null = null,
  tenantId: string | null = null,
  deviceStatus: string | null = null,
  credentialStatus: string | null = null,
  credentialId: string | null = null,
  fingerprint: string | null = null,
): DeviceAccessDecision {
  return {
    allowed: false,
    reason,
    deviceId,
    tenantId,
    deviceStatus,
    credentialStatus,
    credentialId,
    fingerprint,
  };
}
