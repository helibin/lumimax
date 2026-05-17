import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { resolveConfiguredIotVendor } from '@lumimax/config';
import { toUtcIso } from '@lumimax/http-kit';
import type { Repository } from 'typeorm';
import {
  DeviceCommandEntity,
  DeviceEntity,
  DeviceShadowEntity,
} from '../../common/entities/biz.entities';
import { resolveTenantId } from '../../common/tenant-scope.util';
import { getDefaultLocale } from '../../config/default-locale';
import { getDefaultDietMarket } from '../../diet/market/diet-market';
import { DeviceTelemetryService } from '../telemetry/device-telemetry.service';
import type { DeviceCloudInboundPort } from './device-cloud-inbound.port';

@Injectable()
export class DeviceCloudInboundService implements DeviceCloudInboundPort {
  constructor(
    @InjectRepository(DeviceEntity)
    private readonly deviceRepository: Repository<DeviceEntity>,
    @InjectRepository(DeviceCommandEntity)
    private readonly deviceCommandRepository: Repository<DeviceCommandEntity>,
    @InjectRepository(DeviceShadowEntity)
    private readonly deviceShadowRepository: Repository<DeviceShadowEntity>,
    private readonly deviceTelemetryService: DeviceTelemetryService,
  ) {}

  async activateFromCloud(
    body: Record<string, unknown>,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const providerDeviceId = pickString(body.providerDeviceId) ?? pickString(body.deviceId);
    if (!providerDeviceId) {
      throw new Error('providerDeviceId is required');
    }
    const activatedAt = new Date(pickString(body.activatedAt) ?? new Date().toISOString());
    const registrationContext = resolveDeviceRegistrationContext(body);
    let device = await this.deviceRepository.findOne({
      where: [{ id: providerDeviceId }, { deviceSn: providerDeviceId }],
    });
    if (!device) {
      const tenantId = resolveTenantId();
      device = this.deviceRepository.create({
        tenantId,
        deviceSn: providerDeviceId,
        productKey: pickString(body.productKey) ?? 'default',
        provider: resolveConfiguredIotVendor(),
        status: 'active',
        onlineStatus: 'online',
        locale: registrationContext.locale,
        market: getDefaultDietMarket(),
        lastSeenAt: activatedAt,
      });
    } else {
      device.status = 'active';
      device.onlineStatus = 'online';
      device.locale = registrationContext.locale ?? device.locale ?? null;
      device.market = device.market ?? getDefaultDietMarket();
      device.lastSeenAt = activatedAt;
    }
    const saved = await this.deviceRepository.save(device);
    await this.deviceTelemetryService.recordHeartbeat(
      saved,
      {
        ...body,
        lastSeenAt: activatedAt.toISOString(),
        source: pickString(body.source) ?? 'device_connect_register',
      },
      requestId,
      activatedAt,
    );
    return toDeviceDetail(saved);
  }

  async markOnlineFromCloud(
    body: Record<string, unknown>,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const providerDeviceId = pickString(body.providerDeviceId) ?? pickString(body.deviceId);
    if (!providerDeviceId) {
      throw new Error('providerDeviceId is required');
    }
    const device = await this.deviceRepository.findOne({
      where: [{ id: providerDeviceId }, { deviceSn: providerDeviceId }],
    });
    if (!device) {
      return this.activateFromCloud(body, requestId);
    }
    device.onlineStatus = 'online';
    device.lastSeenAt = new Date(pickString(body.lastSeenAt) ?? new Date().toISOString());
    const saved = await this.deviceRepository.save(device);
    await this.deviceTelemetryService.appendStatusLog(saved, body, requestId);
    return toDeviceDetail(saved);
  }

  async markOfflineFromCloud(
    body: Record<string, unknown>,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const providerDeviceId = pickString(body.providerDeviceId) ?? pickString(body.deviceId);
    if (!providerDeviceId) {
      throw new Error('providerDeviceId is required');
    }
    const device = await this.deviceRepository.findOne({
      where: [{ id: providerDeviceId }, { deviceSn: providerDeviceId }],
    });
    if (!device) {
      return {
        skipped: true,
        reason: `device not found: ${providerDeviceId}`,
      };
    }
    device.onlineStatus = 'offline';
    const saved = await this.deviceRepository.save(device);
    await this.deviceTelemetryService.appendStatusLog(
      saved,
      {
        ...body,
        reason: pickString(body.reason) ?? 'cloud_disconnect',
      },
      requestId,
    );
    return toDeviceDetail(saved);
  }

  async recordHeartbeatTelemetry(
    body: Record<string, unknown>,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const providerDeviceId = pickString(body.providerDeviceId) ?? pickString(body.deviceId);
    if (!providerDeviceId) {
      throw new Error('providerDeviceId is required');
    }
    const device = await this.deviceRepository.findOne({
      where: [{ id: providerDeviceId }, { deviceSn: providerDeviceId }],
    });
    if (!device) {
      return {
        skipped: true,
        reason: `device not found: ${providerDeviceId}`,
      };
    }
    return this.deviceTelemetryService.recordHeartbeat(
      device,
      body,
      requestId,
      new Date(pickString(body.lastSeenAt) ?? new Date().toISOString()),
    );
  }

  async applyAttrResult(
    body: Record<string, unknown>,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const device = await this.findDeviceByProviderIdOrThrow(body);
    const code = pickNumber(body.code) ?? 0;
    const msg = pickString(body.msg) ?? (code === 0 ? 'ok' : 'failed');
    const applied = asRecord(body.applied);
    if (code !== 0) {
      await this.deviceTelemetryService.appendStatusLog(device, body, requestId);
      return {
        deviceId: device.id,
        code,
        msg,
        applied: {},
        reported: null,
        desired: null,
        version: null,
        updatedAt: null,
      };
    }
    const existed = await this.deviceShadowRepository.findOne({
      where: { tenantId: device.tenantId, deviceId: device.id },
    });
    const desired = { ...(existed?.desired ?? {}) };
    for (const key of Object.keys(applied)) {
      delete desired[key];
    }
    const saved = await this.deviceShadowRepository.save(
      this.deviceShadowRepository.create({
        id: existed?.id,
        tenantId: device.tenantId,
        deviceId: device.id,
        reported: {
          ...(existed?.reported ?? {}),
          ...applied,
        },
        desired,
        shadowVersion: (existed?.shadowVersion ?? 0) + 1,
        sourceProvider: existed?.sourceProvider ?? device.provider,
      }),
    );
    await this.deviceTelemetryService.appendStatusLog(device, body, requestId);
    return {
      deviceId: saved.deviceId,
      code,
      msg,
      applied,
      reported: saved.reported ?? {},
      desired: saved.desired ?? {},
      version: saved.shadowVersion,
      updatedAt: toUtcIso(saved.updatedAt),
    };
  }

  async handleCommandResult(
    body: Record<string, unknown>,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const device = await this.findDeviceByProviderIdOrThrow(body);
    const event = pickString(body.event) ?? '';
    const resultCode = pickNumber(body.code);
    const command = await this.deviceCommandRepository.findOne({
      where: { deviceId: device.id, id: requestId },
      order: { createdAt: 'DESC' },
    });
    if (!command) {
      return {
        ok: true,
        matched: false,
        deviceId: device.id,
        requestId,
        event,
      };
    }

    command.payloadJson = {
      ...(command.payloadJson ?? {}),
      lastReport: body,
    };

    if (event === 'cmd.ota.upgrade.progress') {
      command.status = pickString(body.status) ?? 'in_progress';
      command.failureReason = null;
    } else if (resultCode === 0) {
      command.status = normalizeCommandResultStatus(event, body);
      command.failureReason = null;
      command.ackedAt = new Date();
    } else {
      command.status = 'failed';
      command.failureReason = pickString(body.msg) ?? `code=${resultCode ?? 'unknown'}`;
      command.ackedAt = new Date();
    }

    const saved = await this.deviceCommandRepository.save(command);
    await this.deviceTelemetryService.appendStatusLog(device, body, requestId);
    return {
      id: saved.id,
      deviceId: saved.deviceId,
      commandType: saved.commandType,
      status: saved.status,
      ackedAt: saved.ackedAt?.toISOString() ?? null,
      requestId,
      event,
    };
  }

  private async findDeviceByProviderIdOrThrow(
    body: Record<string, unknown>,
    tenantScope?: string,
  ): Promise<DeviceEntity> {
    const providerDeviceId = pickString(body.providerDeviceId) ?? pickString(body.deviceId);
    if (!providerDeviceId) {
      throw new Error('providerDeviceId is required');
    }
    const tenantId = resolveTenantId(tenantScope);
    const device =
      await this.deviceRepository.findOne({
        where: [{ tenantId, id: providerDeviceId }, { tenantId, deviceSn: providerDeviceId }],
      })
      ?? await this.deviceRepository.findOne({
        where: [{ id: providerDeviceId }, { deviceSn: providerDeviceId }],
      });
    if (!device) {
      throw new Error(`device not found: ${providerDeviceId}`);
    }
    return device;
  }
}

function toDeviceDetail(device: DeviceEntity): Record<string, unknown> {
  return {
    id: device.id,
    tenantId: device.tenantId,
    name: device.name,
    deviceName: device.name,
    deviceSn: device.deviceSn,
    productKey: device.productKey,
    provider: device.provider,
    status: device.status,
    onlineStatus: device.onlineStatus,
    boundUserId: device.boundUserId ?? null,
    locale: device.locale ?? null,
    market: device.market ?? null,
    countryCode: device.countryCode ?? null,
    createdAt: device.createdAt.toISOString(),
    lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    updatedAt: toUtcIso(device.updatedAt),
  };
}

function normalizeCommandResultStatus(
  event: string,
  payload: Record<string, unknown>,
): string {
  if (event === 'cmd.ota.upgrade.accepted') return 'accepted';
  if (event === 'cmd.ota.upgrade.result') {
    return pickString(payload.status) ?? 'success';
  }
  if (event === 'cmd.ota.cancel.result') return 'cancelled';
  return pickString(payload.status) ?? 'accepted';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function resolveDeviceRegistrationContext(input: Record<string, unknown>): { locale: string } {
  const locale = pickString(input.locale) ?? getDefaultLocale();
  return { locale };
}

function pickString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function pickNumber(value: unknown): number | undefined {
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
