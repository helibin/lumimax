import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { toUtcIso } from '@lumimax/http-kit';
import type { Repository } from 'typeorm';
import { LessThan } from 'typeorm';
import {
  DeviceEntity,
  DeviceRuntimeStatusEntity,
  DeviceShadowEntity,
  DeviceStatusLogEntity,
} from '../../common/entities/biz.entities';

@Injectable()
export class DeviceTelemetryService {
  constructor(
    @InjectRepository(DeviceEntity)
    private readonly deviceRepository: Repository<DeviceEntity>,
    @InjectRepository(DeviceStatusLogEntity)
    private readonly deviceStatusLogRepository: Repository<DeviceStatusLogEntity>,
    @InjectRepository(DeviceShadowEntity)
    private readonly deviceShadowRepository: Repository<DeviceShadowEntity>,
    @InjectRepository(DeviceRuntimeStatusEntity)
    private readonly deviceRuntimeStatusRepository: Repository<DeviceRuntimeStatusEntity>,
  ) {}

  async appendStatusLog(
    device: DeviceEntity,
    payload: Record<string, unknown>,
    _requestId: string,
  ): Promise<void> {
    await this.deviceStatusLogRepository.save(
      this.deviceStatusLogRepository.create({
        tenantId: device.tenantId,
        deviceId: device.id,
        onlineStatus: device.onlineStatus,
        deviceStatus: device.status,
        payloadJson: payload,
        reportedAt: new Date(),
      }),
    );
  }

  async markStaleDevicesOffline(input: {
    timeoutMs: number;
    requestId: string;
  }): Promise<number> {
    const cutoff = new Date(Date.now() - input.timeoutMs);
    const devices = await this.deviceRepository.find({
      where: {
        onlineStatus: 'online',
        lastSeenAt: LessThan(cutoff),
      },
      take: 500,
      order: { lastSeenAt: 'ASC' },
    });

    for (const device of devices) {
      device.onlineStatus = 'offline';
      const saved = await this.deviceRepository.save(device);
      await this.appendStatusLog(
        saved,
        {
          reason: 'heartbeat_timeout',
          timeoutMs: input.timeoutMs,
          lastSeenAt: saved.lastSeenAt?.toISOString() ?? null,
          markedOfflineAt: new Date().toISOString(),
        },
        input.requestId,
      );
    }

    return devices.length;
  }

  async readShadow(device: DeviceEntity): Promise<Record<string, unknown>> {
    const shadow = await this.deviceShadowRepository.findOne({
      where: { tenantId: device.tenantId, deviceId: device.id },
    });
    if (!shadow) {
      return {
        deviceId: device.id,
        reported: {},
        desired: {},
        version: 1,
        sourceProvider: device.provider,
        updatedAt: new Date().toISOString(),
      };
    }
    return {
      deviceId: shadow.deviceId,
      reported: shadow.reported ?? {},
      desired: shadow.desired ?? {},
      version: shadow.shadowVersion,
      sourceProvider: shadow.sourceProvider,
      updatedAt: toUtcIso(shadow.updatedAt),
    };
  }

  async saveShadow(
    device: DeviceEntity,
    desired: Record<string, unknown>,
    _requestId: string,
  ): Promise<Record<string, unknown>> {
    const existed = await this.deviceShadowRepository.findOne({
      where: { tenantId: device.tenantId, deviceId: device.id },
    });
    const saved = await this.deviceShadowRepository.save(
      this.deviceShadowRepository.create({
        id: existed?.id,
        tenantId: device.tenantId,
        deviceId: device.id,
        reported: existed?.reported ?? {},
        desired,
        shadowVersion: (existed?.shadowVersion ?? 0) + 1,
        sourceProvider: existed?.sourceProvider ?? device.provider,
      }),
    );
    return {
      deviceId: saved.deviceId,
      reported: saved.reported ?? {},
      desired: saved.desired ?? {},
      version: saved.shadowVersion,
      sourceProvider: saved.sourceProvider,
      updatedAt: toUtcIso(saved.updatedAt),
    };
  }

  async recordHeartbeat(
    device: DeviceEntity,
    payload: Record<string, unknown>,
    requestId: string,
    reportedAtInput?: Date,
  ): Promise<Record<string, unknown>> {
    const reportedAt = reportedAtInput ?? new Date();
    device.lastSeenAt = reportedAt;
    device.onlineStatus = 'online';
    const savedDevice = await this.deviceRepository.save(device);

    const existed = await this.deviceRuntimeStatusRepository.findOne({
      where: { tenantId: device.tenantId, deviceId: device.id },
    });
    const snapshot = extractRuntimeSnapshot(payload, existed?.payloadJson ?? {});
    const savedRuntime = await this.deviceRuntimeStatusRepository.save(
      this.deviceRuntimeStatusRepository.create({
        id: existed?.id,
        tenantId: device.tenantId,
        deviceId: device.id,
        batteryLevel: snapshot.batteryLevel,
        firmwareVersion: snapshot.firmwareVersion,
        hardwareVersion: snapshot.hardwareVersion,
        protocolVersion: snapshot.protocolVersion,
        rssi: snapshot.rssi,
        temperature: snapshot.temperature,
        networkStatus: snapshot.networkStatus,
        payloadJson: payload,
        reportedAt,
      }),
    );

    await this.appendStatusLog(
      savedDevice,
      {
        ...payload,
        source: pickString(payload.source) ?? 'device_heartbeat',
        lastSeenAt: reportedAt.toISOString(),
      },
      requestId,
    );

    return {
      deviceId: device.id,
      lastSeenAt: savedDevice.lastSeenAt?.toISOString() ?? reportedAt.toISOString(),
      batteryLevel: savedRuntime.batteryLevel ?? null,
      firmwareVersion: savedRuntime.firmwareVersion ?? null,
      hardwareVersion: savedRuntime.hardwareVersion ?? null,
      protocolVersion: savedRuntime.protocolVersion ?? null,
      rssi: savedRuntime.rssi ?? null,
      temperature:
        savedRuntime.temperature == null ? null : Number(savedRuntime.temperature),
      networkStatus: savedRuntime.networkStatus ?? null,
      reportedAt: savedRuntime.reportedAt?.toISOString() ?? reportedAt.toISOString(),
      payload: savedRuntime.payloadJson ?? {},
    };
  }

}

function extractRuntimeSnapshot(
  payload: Record<string, unknown>,
  previousPayload: Record<string, unknown>,
): {
  batteryLevel: number | null;
  firmwareVersion: null | string;
  hardwareVersion: null | string;
  protocolVersion: null | string;
  rssi: number | null;
  temperature: null | string;
  networkStatus: null | string;
} {
  return {
    batteryLevel: clampPercentage(
      pickNumber(payload.batteryLevel)
      ?? pickNumber(payload.battery)
      ?? pickNumber(payload.batteryPercent)
      ?? pickNumber(previousPayload.batteryLevel)
      ?? pickNumber(previousPayload.battery),
    ),
    firmwareVersion:
      pickString(payload.firmwareVersion)
      ?? pickString(payload.fwVersion)
      ?? pickString(previousPayload.firmwareVersion)
      ?? null,
    hardwareVersion:
      pickString(payload.hardwareVersion)
      ?? pickString(payload.hwVersion)
      ?? pickString(previousPayload.hardwareVersion)
      ?? null,
    protocolVersion:
      pickString(payload.protocolVersion)
      ?? pickString(previousPayload.protocolVersion)
      ?? null,
    rssi:
      pickInteger(payload.rssi)
      ?? pickInteger(payload.signalStrength)
      ?? pickInteger(previousPayload.rssi),
    temperature: normalizeNumericString(
      pickNumber(payload.temperature)
      ?? pickNumber(payload.temp)
      ?? pickNumber(previousPayload.temperature),
    ),
    networkStatus:
      pickString(payload.networkStatus)
      ?? pickString(payload.connectionStatus)
      ?? pickString(payload.network)
      ?? pickString(previousPayload.networkStatus)
      ?? null,
  };
}

function clampPercentage(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
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

function pickInteger(value: unknown): number | null {
  const parsed = pickNumber(value);
  return typeof parsed === 'number' ? Math.round(parsed) : null;
}

function normalizeNumericString(value: number | undefined): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : null;
}
