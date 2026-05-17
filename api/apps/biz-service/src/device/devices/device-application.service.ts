import { Inject, Injectable } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { AuthenticatedUser } from '@lumimax/auth';
import { toUtcIso } from '@lumimax/http-kit';
import { generateId } from '@lumimax/runtime';
import { decryptDeviceCredentialSecret } from '@lumimax/security';
import { resolveConfiguredIotVendor } from '@lumimax/config';
import type { Repository } from 'typeorm';
import {
  DeviceCommandEntity,
  DeviceCredentialEntity,
  DeviceEntity,
  DeviceRuntimeStatusEntity,
  DeviceShadowEntity,
  DeviceStatusLogEntity,
  IotProvisionRecordEntity,
  MealRecordEntity,
  RecognitionLogEntity,
} from '../../common/entities/biz.entities';
import { DeviceBindingService } from '../bindings/device-binding.service';
import { DeviceCommandService } from '../commands/device-command.service';
import { OtaService } from '../ota/ota.service';
import { DeviceTelemetryService } from '../telemetry/device-telemetry.service';
import { DeviceCloudInboundService } from './device-cloud-inbound.service';
import { BizIotTopicKind } from '../../iot/iot.types';
import { resolveTenantId } from '../../common/tenant-scope.util';
import { getDefaultLocale } from '../../config/default-locale';
import { getDefaultDietMarket } from '../../diet/market/diet-market';
import { buildDeviceCertificatePackage } from './device-certificate-package.util';
import { getDefaultAwsIotRootCaPem } from './device-certificate-package.util';
import type { DeviceIdentityPort } from '../identity/device-identity.port';
import { DEVICE_IDENTITY_PORT } from '../identity/device-identity.port';
import type { IotDownlinkPort } from '../../iot/transport/iot-downlink.port';
import { IOT_DOWNLINK } from '../../iot/transport/iot-downlink.port';

@Injectable()
export class DeviceApplicationService {
  private readonly logger = new Logger(DeviceApplicationService.name);

  constructor(
    @InjectRepository(DeviceEntity)
    private readonly deviceRepository: Repository<DeviceEntity>,
    @InjectRepository(DeviceCommandEntity)
    private readonly deviceCommandRepository: Repository<DeviceCommandEntity>,
    @InjectRepository(DeviceCredentialEntity)
    private readonly deviceCredentialRepository: Repository<DeviceCredentialEntity>,
    @InjectRepository(DeviceShadowEntity)
    private readonly deviceShadowRepository: Repository<DeviceShadowEntity>,
    @InjectRepository(DeviceRuntimeStatusEntity)
    private readonly deviceRuntimeStatusRepository: Repository<DeviceRuntimeStatusEntity>,
    @InjectRepository(DeviceStatusLogEntity)
    private readonly deviceStatusLogRepository: Repository<DeviceStatusLogEntity>,
    @InjectRepository(IotProvisionRecordEntity)
    private readonly iotProvisionRecordRepository: Repository<IotProvisionRecordEntity>,
    @InjectRepository(MealRecordEntity)
    private readonly mealRecordRepository: Repository<MealRecordEntity>,
    @InjectRepository(RecognitionLogEntity)
    private readonly recognitionLogRepository: Repository<RecognitionLogEntity>,
    @Inject(DeviceBindingService)
    private readonly deviceBindingService: DeviceBindingService,
    @Inject(DeviceCommandService)
    private readonly deviceCommandService: DeviceCommandService,
    @Inject(DeviceTelemetryService)
    private readonly deviceTelemetryService: DeviceTelemetryService,
    @Inject(DeviceCloudInboundService)
    private readonly deviceCloudInboundService: DeviceCloudInboundService,
    @Inject(OtaService) private readonly otaService: OtaService,
    @Inject(IOT_DOWNLINK)
    private readonly iotDownlinkService: IotDownlinkPort,
    @Inject(DEVICE_IDENTITY_PORT)
    private readonly deviceIdentityService: DeviceIdentityPort,
  ) {}

  async execute<T = unknown>(input: {
    operation: string;
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    user?: AuthenticatedUser | null;
    tenantScope?: string;
    requestId: string;
  }) {
    const local = await this.tryExecuteLocal(input);
    if (local === undefined) {
      throw new Error(`Unsupported biz device operation: ${input.operation}`);
    }
    return local as T;
  }

  private async tryExecuteLocal(input: {
    operation: string;
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    user?: AuthenticatedUser | null;
    tenantScope?: string;
    requestId: string;
  }): Promise<unknown | undefined> {
    const params = input.params ?? {};
    const query = input.query ?? {};
    const body = input.body ?? {};
    const user = input.user ?? null;
    const tenantId = resolveTenantId(input.tenantScope);

    switch (input.operation) {
      case 'devices.list':
        return this.listUserDevices(query, user, tenantId);
      case 'devices.get':
        return this.getUserDevice(String(params.id ?? ''), user, tenantId);
      case 'devices.create':
        return this.createUserDevice(body, user, tenantId, input.requestId);
      case 'devices.bind':
        return this.bindUserDevice(String(params.id ?? ''), body, user, tenantId, input.requestId);
      case 'devices.unbind':
        return this.unbindUserDevice(String(params.id ?? ''), user, tenantId, input.requestId);
      case 'devices.command':
        return this.requestDeviceCommand(String(params.id ?? ''), body, user, tenantId, input.requestId);
      case 'devices.shadow.get':
        return this.getDeviceShadow(String(params.id ?? ''), user, tenantId);
      case 'devices.shadow.patch':
        return this.patchDeviceShadow(String(params.id ?? ''), body, user, tenantId, input.requestId);
      case 'internal.devices.activateFromCloud':
        return this.deviceCloudInboundService.activateFromCloud(body, input.requestId);
      case 'internal.devices.markOnlineFromCloud':
        return this.deviceCloudInboundService.markOnlineFromCloud(body, input.requestId);
      case 'internal.devices.markOfflineFromCloud':
        return this.deviceCloudInboundService.markOfflineFromCloud(body, input.requestId);
      case 'internal.devices.recordHeartbeatTelemetry':
        return this.deviceCloudInboundService.recordHeartbeatTelemetry(body, input.requestId);
      case 'internal.devices.applyAttrResult':
        return this.deviceCloudInboundService.applyAttrResult(body, input.requestId);
      case 'internal.devices.handleCommandResult':
        return this.deviceCloudInboundService.handleCommandResult(body, input.requestId);
      case 'admin.devices.list':
        return this.listDevices(query, tenantId);
      case 'admin.devices.get':
        return this.getDevice(String(params.id ?? ''), tenantId);
      case 'admin.devices.create':
        return this.createDevice(body, tenantId, input.requestId);
      case 'admin.devices.credential.get':
        return this.getAdminDeviceCredential(String(params.id ?? ''), tenantId);
      case 'admin.devices.credential.download':
        return this.downloadAdminDeviceCredential(String(params.id ?? ''), tenantId, input.requestId);
      case 'admin.devices.credential.claim':
        return this.claimAdminDeviceCredential(String(params.id ?? ''), tenantId, input.requestId);
      case 'admin.devices.credential.rotate':
        return this.rotateAdminDeviceCredential(String(params.id ?? ''), body, tenantId, input.requestId);
      case 'admin.devices.updateStatus':
        return this.updateDeviceStatus(String(params.id ?? ''), body, tenantId, input.requestId);
      case 'admin.devices.delete':
        return this.deleteDevice(String(params.id ?? ''), tenantId, input.requestId);
      case 'admin.devices.bind':
        return this.bindDevice(String(params.id ?? ''), body, tenantId, input.requestId);
      case 'admin.devices.unbind':
        return this.unbindDevice(String(params.id ?? ''), tenantId, input.requestId);
      case 'admin.devices.provision':
        return this.provisionDevice(String(params.id ?? ''), body, tenantId, input.requestId);
      case 'admin.devices.command':
        return this.requestAdminDeviceCommand(String(params.id ?? ''), body, tenantId, input.requestId);
      case 'admin.devices.commands.list':
        return this.listAdminDeviceCommands(String(params.id ?? ''), tenantId);
      case 'admin.devices.ota.upgrade':
        return this.requestOtaUpgrade(String(params.id ?? ''), body, tenantId, input.requestId);
      case 'admin.devices.ota.cancel':
        return this.cancelOtaUpgrade(String(params.id ?? ''), tenantId, input.requestId);
      case 'admin.devices.ota.tasks':
        return this.listOtaTasks(String(params.id ?? ''), tenantId);
      case 'admin.dashboard.overview':
        return this.getAdminDashboardOverview(tenantId);
      default:
        return undefined;
    }
  }

  private async listUserDevices(
    query: Record<string, unknown>,
    user: AuthenticatedUser | null,
    tenantId: string,
  ): Promise<Record<string, unknown>> {
    const userId = requireUserId(user);
    const page = normalizePage(query.page);
    const pageSize = normalizePageSize(query.pageSize);
    const qb = this.deviceRepository.createQueryBuilder('device');
    this.applyDeviceListFilters(qb, query, tenantId, userId);
    qb.orderBy('device.createdAt', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    const runtimeByDeviceId = await this.loadRuntimeStatusMap(items.map((item) => item.id));
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
      items: items.map((item) =>
        this.toDeviceListItem(item, runtimeByDeviceId.get(item.id) ?? null),
      ),
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }

  private async getUserDevice(
    id: string,
    user: AuthenticatedUser | null,
    tenantId: string,
  ): Promise<Record<string, unknown>> {
    const userId = requireUserId(user);
    const device = await this.findBoundDeviceOrThrow(id, userId, tenantId);
    return this.toDeviceDetail(device);
  }

  private async createUserDevice(
    body: Record<string, unknown>,
    user: AuthenticatedUser | null,
    tenantId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const userId = requireUserId(user);
    const deviceSn =
      pickString(body.deviceSn) ?? pickString(body.deviceId) ?? `user-${generateId()}`;
    const { entity, state } = await this.createOrUpsertDevice({
      tenantId,
      name: pickString(body.name) ?? deviceSn,
      deviceSn,
      productKey: pickString(body.productKey) ?? pickString(body.deviceType) ?? 'smart-scale',
      provider: resolveConfiguredIotVendor(),
      status: pickString(body.status) ?? 'active',
      onlineStatus: pickString(body.onlineStatus) ?? 'offline',
      boundUserId: userId,
      locale: getDefaultLocale(),
      market: getDefaultDietMarket(),
      requestId,
    });
    if (state === 'reused') {
      if (entity.boundUserId && entity.boundUserId !== userId) {
        throw new Error(`device already bound: ${entity.id}`);
      }
      if (entity.boundUserId !== userId) {
        entity.boundUserId = userId;
        await this.deviceRepository.save(entity);
        await this.deviceBindingService.appendBinding(tenantId, entity.id, userId, requestId);
      }
      return this.buildSkippedProvisionResponse(entity, requestId);
    }
    await this.deviceBindingService.appendBinding(tenantId, entity.id, userId, requestId);
    try {
      return await this.withIotProvision(entity, requestId, 'devices.create');
    } catch (error) {
      await this.deviceBindingService.closeActiveBinding(tenantId, entity.id, userId, requestId);
      if (state === 'created') {
        await this.deviceRepository.delete({ tenantId, id: entity.id });
      }
      throw error;
    }
  }

  private async bindUserDevice(
    id: string,
    body: Record<string, unknown>,
    user: AuthenticatedUser | null,
    tenantId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const userId = requireUserId(user);
    const device = await this.deviceRepository.findOne({ where: { tenantId, id: id.trim() } });
    if (!device) {
      throw new Error(`device not found: ${id}`);
    }
    if (device.boundUserId && device.boundUserId !== userId) {
      throw new Error(`device already bound: ${id}`);
    }
    const targetUserId = pickString(body.userId) ?? userId;
    device.boundUserId = targetUserId;
    const saved = await this.deviceRepository.save(device);
    await this.deviceBindingService.appendBinding(tenantId, saved.id, targetUserId, requestId);
    return this.toDeviceDetail(saved);
  }

  private async unbindUserDevice(
    id: string,
    user: AuthenticatedUser | null,
    tenantId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const userId = requireUserId(user);
    const device = await this.findBoundDeviceOrThrow(id, userId, tenantId);
    device.boundUserId = null;
    const saved = await this.deviceRepository.save(device);
    await this.deviceBindingService.closeActiveBinding(tenantId, saved.id, userId, requestId);
    return this.toDeviceDetail(saved);
  }

  private async requestDeviceCommand(
    id: string,
    body: Record<string, unknown>,
    user: AuthenticatedUser | null,
    tenantId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const userId = requireUserId(user);
    const device = await this.findBoundDeviceOrThrow(id, userId, tenantId);
    const commandType = pickString(body.commandType);
    if (!commandType) {
      throw new Error('commandType is required');
    }
    const command = await this.deviceCommandService.createCommandEntity({
      device,
      commandType,
      payload: asRecord(body.payload),
      requestedBy: userId,
      requestId,
    });
    await this.publishCommandDownlink(device, command);
    return this.deviceCommandService.toCommandResult(command);
  }

  private async getDeviceShadow(
    id: string,
    user: AuthenticatedUser | null,
    tenantId: string,
  ): Promise<Record<string, unknown>> {
    const userId = requireUserId(user);
    const device = await this.findBoundDeviceOrThrow(id, userId, tenantId);
    return this.deviceTelemetryService.readShadow(device);
  }

  private async patchDeviceShadow(
    id: string,
    body: Record<string, unknown>,
    user: AuthenticatedUser | null,
    tenantId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const userId = requireUserId(user);
    const device = await this.findBoundDeviceOrThrow(id, userId, tenantId);
    const saved = await this.deviceTelemetryService.saveShadow(
      device,
      asRecord(body.desired),
      requestId,
    );
    await this.publishAttrDownlink(device, asRecord(body.desired), requestId);
    return saved;
  }

  private async activateFromCloud(
    body: Record<string, unknown>,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const providerDeviceId = pickString(body.providerDeviceId) ?? pickString(body.deviceId);
    if (!providerDeviceId) {
      throw new Error('providerDeviceId is required');
    }
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
        lastSeenAt: new Date(pickString(body.activatedAt) ?? new Date().toISOString()),
      });
    } else {
      device.status = 'active';
      device.onlineStatus = 'online';
      device.locale = registrationContext.locale ?? device.locale ?? null;
      device.market = device.market ?? getDefaultDietMarket();
      device.lastSeenAt = new Date(pickString(body.activatedAt) ?? new Date().toISOString());
    }
    const saved = await this.deviceRepository.save(device);
    await this.deviceTelemetryService.appendStatusLog(saved, body, requestId);
    return this.toDeviceDetail(saved);
  }

  private async markOnlineFromCloud(
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
    return this.toDeviceDetail(saved);
  }

  private async markOfflineFromCloud(
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
    return this.toDeviceDetail(saved);
  }

  private async recordHeartbeatTelemetry(
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

  private async applyAttrResult(
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

  private async handleCommandResult(
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

  private async listDevices(
    query: Record<string, unknown>,
    tenantId: string,
  ): Promise<Record<string, unknown>> {
    const page = normalizePage(query.page);
    const pageSize = normalizePageSize(query.pageSize);
    const qb = this.deviceRepository.createQueryBuilder('device');
    this.applyDeviceListFilters(qb, query, tenantId);
    qb.orderBy('device.createdAt', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    const runtimeByDeviceId = await this.loadRuntimeStatusMap(items.map((item) => item.id));
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
      items: items.map((item) =>
        this.toDeviceListItem(item, runtimeByDeviceId.get(item.id) ?? null),
      ),
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }

  private async getDevice(id: string, tenantId: string): Promise<Record<string, unknown>> {
    const device = await this.deviceRepository.findOne({ where: { tenantId, id: id.trim() } });
    if (!device) {
      throw new Error(`device not found: ${id}`);
    }
    const runtime = await this.deviceRuntimeStatusRepository.findOne({
      where: { tenantId, deviceId: device.id },
    });
    return this.toDeviceDetail(device, runtime);
  }

  private async createDevice(
    body: Record<string, unknown>,
    tenantId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const deviceSn = pickString(body.deviceSn) ?? pickString(body.deviceId);
    if (!deviceSn) {
      throw new BadRequestException('deviceSn is required');
    }
    const { entity, state } = await this.createOrUpsertDevice({
      tenantId,
      name: pickString(body.name) ?? deviceSn,
      deviceSn,
      productKey: pickString(body.productKey) ?? 'default',
      provider: resolveConfiguredIotVendor(),
      status: pickString(body.status) ?? 'active',
      onlineStatus: pickString(body.onlineStatus) ?? 'offline',
      boundUserId: pickString(body.boundUserId) ?? null,
      locale: pickString(body.locale) ?? getDefaultLocale(),
      market: getDefaultDietMarket(),
      requestId,
    });
    if (state === 'reused') {
      return this.buildSkippedProvisionResponse(entity, requestId);
    }
    try {
      return await this.withIotProvision(entity, requestId, 'admin.devices.create');
    } catch (error) {
      if (state === 'created') {
        await this.deviceRepository.delete({ tenantId, id: entity.id });
      }
      throw error;
    }
  }

  private async getAdminDeviceCredential(
    id: string,
    tenantId: string,
  ): Promise<Record<string, unknown>> {
    const detail = await this.resolveAdminDeviceCredentialDetail(id, tenantId);
    const { privateKeyPem: _privateKeyPem, ...publicDetail } = detail;
    return publicDetail;
  }

  private async downloadAdminDeviceCredential(
    id: string,
    tenantId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const detail = await this.consumeAdminDeviceCredentialSecret(id, tenantId, 'download', requestId);
    const certificatePem = detail.certificatePem;
    const privateKeyPem = detail.privateKeyPem;
    if (!certificatePem && !privateKeyPem) {
      throw new BadRequestException('device credential package is unavailable');
    }
    const deviceSn = detail.deviceSn || detail.deviceId || 'device';
    const archive = buildDeviceCertificatePackage({
      deviceSn,
      thingName: detail.thingName,
      vendor: detail.vendor,
      endpoint: detail.endpoint,
      region: detail.region,
      productKey: detail.productKey,
      credentialId: detail.credentialId,
      certificatePem: certificatePem ?? null,
      privateKeyPem: privateKeyPem ?? null,
      rootCaPem: detail.rootCaPem ?? null,
    });
    return {
      ...archive,
      deviceId: detail.deviceId,
      deviceSn,
      thingName: detail.thingName ?? null,
      vendor: detail.vendor ?? null,
      endpoint: detail.endpoint ?? null,
      region: detail.region ?? null,
      certificateArn: detail.certificateArn ?? null,
    };
  }

  private async claimAdminDeviceCredential(
    id: string,
    tenantId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const detail = await this.consumeAdminDeviceCredentialSecret(id, tenantId, 'copy', requestId);
    const clientId = detail.thingName ?? detail.deviceSn ?? detail.deviceId;
    const rootCaPem =
      detail.vendor === 'emqx'
        ? detail.rootCaPem ?? null
        : getDefaultAwsIotRootCaPem();
    const clipboardText = [
      `endpoint=${detail.endpoint ?? ''}`,
      `clientId=${clientId ?? ''}`,
      `thingName=${detail.thingName ?? ''}`,
      `region=${detail.region ?? ''}`,
      `vendor=${detail.vendor ?? ''}`,
      'certificatePem=<<EOF',
      detail.certificatePem ?? '',
      'EOF',
      'privateKeyPem=<<EOF',
      detail.privateKeyPem ?? '',
      'EOF',
      'rootCaPem=<<EOF',
      rootCaPem ?? '',
      'EOF',
    ].join('\n');

    return {
      ok: true,
      deviceId: detail.deviceId,
      deviceSn: detail.deviceSn,
      endpoint: detail.endpoint,
      clientId,
      thingName: detail.thingName,
      region: detail.region,
      vendor: detail.vendor,
      productKey: detail.productKey ?? null,
      credentialId: detail.credentialId ?? null,
      certificateArn: detail.certificateArn,
      certificatePem: detail.certificatePem,
      privateKeyPem: detail.privateKeyPem,
      deviceSecret: null,
      rootCaPem,
      clipboardText,
      claimedAt: new Date().toISOString(),
    };
  }

  private async rotateAdminDeviceCredential(
    id: string,
    body: Record<string, unknown>,
    tenantId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const device = await this.mustGetDevice(id, tenantId);
    const result = await this.deviceIdentityService.rotateDeviceCredential({
      tenantId,
      deviceId: device.id,
      deviceSn: device.deviceSn,
      productKey: device.productKey,
      requestId,
      reason: pickString(body.reason),
    });
    return {
      ok: true,
      ...result,
    };
  }

  private async resolveAdminDeviceCredentialDetail(
    id: string,
    tenantId: string,
  ): Promise<Record<string, unknown>> {
    const device = await this.mustGetDevice(id, tenantId);
    const credential = await this.deviceCredentialRepository.findOne({
      where: { tenantId, deviceId: device.id, credentialType: 'certificate' },
      order: { createdAt: 'DESC' },
    });

    if (credential) {
      return this.toDeviceCredentialDetail(device, credential);
    }

    return this.toUnavailableDeviceCredentialDetail(device);
  }

  private async consumeAdminDeviceCredentialSecret(
    id: string,
    tenantId: string,
    method: 'copy' | 'download',
    requestId: string,
  ): Promise<ConsumableDeviceCredentialDetail> {
    const device = await this.mustGetDevice(id, tenantId);
    const credential = await this.deviceCredentialRepository.findOne({
      where: { tenantId, deviceId: device.id, credentialType: 'certificate' },
      order: { createdAt: 'DESC' },
    });

    if (credential) {
      const certificatePem = decryptDeviceCredentialSecret(credential.certificatePem) ?? null;
      const privateKeyPem = decryptDeviceCredentialSecret(credential.privateKeyPem) ?? null;
      const claimedAt = pickString(asRecord(credential.metadataJson?.retrieval).claimedAt);
      if (claimedAt || (!certificatePem && !privateKeyPem)) {
        throw new BadRequestException('device credential secret already claimed');
      }
      await saveConsumedCredential(this.deviceCredentialRepository, credential, method, requestId);
      return {
        certificateArn: credential.certificateArn ?? null,
        certificatePem,
        deviceId: device.id,
        deviceSn: device.deviceSn,
        endpoint: credential.endpoint ?? null,
        privateKeyPem,
        region: credential.region ?? null,
        rootCaPem: pickString(asRecord(credential.metadataJson).rootCaPem) ?? null,
        thingName: credential.thingName ?? null,
        vendor: credential.vendor ?? null,
        productKey: pickString(asRecord(credential.metadataJson).productKey) ?? null,
        credentialId: credential.credentialId ?? null,
      };
    }

    throw new BadRequestException('device credential package is unavailable');
  }

  private async updateDeviceStatus(
    id: string,
    body: Record<string, unknown>,
    tenantId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const device = await this.deviceRepository.findOne({ where: { tenantId, id: id.trim() } });
    if (!device) {
      throw new Error(`device not found: ${id}`);
    }
    device.status = pickString(body.status) ?? device.status;
    const saved = await this.deviceRepository.save(device);
    await this.deviceTelemetryService.appendStatusLog(saved, body, requestId);
    return this.toDeviceDetail(saved);
  }

  private async deleteDevice(
    id: string,
    tenantId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const device = await this.deviceRepository.findOne({ where: { tenantId, id: id.trim() } });
    if (!device) {
      throw new Error(`device not found: ${id}`);
    }
    const cloudCleanup = await this.deviceIdentityService.deleteDeviceIdentity({
      tenantId,
      deviceId: device.id,
      deviceSn: device.deviceSn,
      productKey: device.productKey,
      vendor: toVendorName(device.provider),
      requestId,
    });
    await this.deviceBindingService.deleteAllBindings(tenantId, device.id);
    await this.deviceCommandRepository.delete({ tenantId, deviceId: device.id });
    await this.deviceCredentialRepository.delete({ tenantId, deviceId: device.id });
    await this.deviceShadowRepository.delete({ tenantId, deviceId: device.id });
    await this.deviceStatusLogRepository.delete({ tenantId, deviceId: device.id });
    await this.iotProvisionRecordRepository.delete({ tenantId, deviceId: device.id });
    await this.mealRecordRepository.delete({ tenantId, deviceId: device.id });
    await this.recognitionLogRepository.delete({ tenantId, deviceId: device.id });
    await this.deviceRepository.delete({ tenantId, id: device.id });
    return { ok: true, id: device.id, requestId, cloudCleanup };
  }

  private async bindDevice(
    id: string,
    body: Record<string, unknown>,
    tenantId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const device = await this.deviceRepository.findOne({ where: { tenantId, id: id.trim() } });
    if (!device) {
      throw new Error(`device not found: ${id}`);
    }
    const boundUserId = pickString(body.userId) ?? pickString(body.boundUserId);
    if (!boundUserId) {
      throw new Error('userId is required');
    }
    device.boundUserId = boundUserId;
    const saved = await this.deviceRepository.save(device);
    await this.deviceBindingService.appendBinding(tenantId, saved.id, boundUserId, requestId);
    return this.toDeviceDetail(saved);
  }

  private async unbindDevice(
    id: string,
    tenantId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const device = await this.deviceRepository.findOne({ where: { tenantId, id: id.trim() } });
    if (!device) {
      throw new Error(`device not found: ${id}`);
    }
    const boundUserId = device.boundUserId;
    device.boundUserId = null;
    const saved = await this.deviceRepository.save(device);
    if (boundUserId) {
      await this.deviceBindingService.closeActiveBinding(tenantId, saved.id, boundUserId, requestId);
    }
    return this.toDeviceDetail(saved);
  }

  private async provisionDevice(
    id: string,
    body: Record<string, unknown>,
    tenantId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const device = await this.deviceRepository.findOne({ where: { tenantId, id: id.trim() } });
    if (!device) {
      throw new Error(`device not found: ${id}`);
    }
    const forceReissue = pickBoolean(body.forceReissue) || pickBoolean(body.rotateCertificate);
    const credential = await this.deviceCredentialRepository.findOne({
      where: { tenantId, deviceId: device.id, credentialType: 'certificate' },
      order: { createdAt: 'DESC' },
    });
    device.status = 'active';
    device.onlineStatus = pickString(body.onlineStatus) ?? device.onlineStatus ?? 'offline';
    const saved = await this.deviceRepository.save(device);
    await this.deviceTelemetryService.appendStatusLog(saved, body, requestId);
    const iotProvision = forceReissue
      ? await this.deviceIdentityService.rotateDeviceCredential({
        tenantId,
        deviceId: device.id,
        deviceSn: device.deviceSn,
        productKey: device.productKey,
        requestId,
        reason: pickString(body.reason) ?? 'admin.devices.provision.force_reissue',
      })
      : !credential || credential.status !== 'active'
        ? await this.deviceIdentityService.provisionOnDeviceCreated({
          deviceId: device.id,
          deviceSn: device.deviceSn,
          provider: device.provider,
          productKey: device.productKey,
          tenantId,
          requestId,
          trigger: 'admin.devices.provision',
        })
        : {
          ok: true,
          skipped: true,
          reason: 'active_credential_exists',
          vendor: credential.vendor,
          credentialId: credential.credentialId ?? null,
          credentialStatus: credential.status,
        };
    return {
      ...this.toDeviceDetail(saved),
      provisioned: true,
      iotProvision,
    };
  }

  private async listAdminDeviceCommands(
    id: string,
    tenantId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const device = await this.mustGetDevice(id, tenantId);
    return this.deviceCommandService.listAdminDeviceCommands(tenantId, device.id);
  }

  private async requestAdminDeviceCommand(
    id: string,
    body: Record<string, unknown>,
    tenantId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const device = await this.mustGetDevice(id, tenantId);
    const commandType = pickString(body.commandType);
    if (!commandType) {
      throw new Error('commandType is required');
    }
    const command = await this.deviceCommandService.createCommandEntity({
      device,
      commandType,
      payload: asRecord(body.payload),
      requestedBy: pickString(body.requestedBy) ?? 'system_admin',
      requestId,
    });
    await this.publishCommandDownlink(device, command);
    return this.deviceCommandService.toCommandResult(command);
  }

  private async requestOtaUpgrade(
    id: string,
    body: Record<string, unknown>,
    tenantId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const device = await this.mustGetDevice(id, tenantId);
    const command = await this.otaService.createOtaUpgradeCommand(device, body, requestId);
    await this.publishOtaUpgradeDownlink(device, command);
    return this.deviceCommandService.toCommandResult(command);
  }

  private async cancelOtaUpgrade(
    id: string,
    tenantId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const device = await this.mustGetDevice(id, tenantId);
    const latest = await this.otaService.findLatestOtaCommand(tenantId, device.id);
    if (!latest) {
      return { ok: true, cancelled: false, requestId };
    }
    await this.publishOtaCancelDownlink(device, latest, requestId);
    await this.otaService.cancelOtaCommand(latest, requestId);
    return { ok: true, cancelled: true, id: latest.id, requestId };
  }

  private async listOtaTasks(
    id: string,
    tenantId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const device = await this.mustGetDevice(id, tenantId);
    return this.otaService.listOtaTasks(tenantId, device.id);
  }

  private async getAdminDashboardOverview(tenantId: string): Promise<Record<string, unknown>> {
    const todayStartAt = new Date();
    todayStartAt.setHours(0, 0, 0, 0);

    const [deviceTotal, onlineDeviceTotal, todayMealTotal, recognitionSummary] =
      await Promise.all([
        this.deviceRepository.count({ where: { tenantId } }),
        this.deviceRepository.count({ where: { tenantId, onlineStatus: 'online' } }),
        this.mealRecordRepository
          .createQueryBuilder('meal')
          .where('meal.tenantId = :tenantId', { tenantId })
          .andWhere('meal.createdAt >= :start', { start: todayStartAt })
          .getCount(),
        this.recognitionLogRepository
          .createQueryBuilder('log')
          .select('COUNT(*)', 'total')
          .addSelect(
            "SUM(CASE WHEN LOWER(log.status) IN ('failed', 'error') THEN 1 ELSE 0 END)",
            'failed',
          )
          .where('log.tenantId = :tenantId', { tenantId })
          .andWhere('log.createdAt >= :start', { start: todayStartAt })
          .getRawOne<{ total: string; failed: string }>(),
      ]);

    return {
      deviceTotal,
      onlineDeviceTotal,
      todayNewUsers: 0,
      todayMealTotal,
      todayRecognitionTotal: Number(recognitionSummary?.total ?? 0),
      todayRecognitionFailedTotal: Number(recognitionSummary?.failed ?? 0),
      recognitionProviderStatus: 'ok',
      systemServiceStatus: 'ok',
    };
  }

  private async findBoundDeviceOrThrow(
    id: string,
    userId: string,
    tenantId: string,
  ): Promise<DeviceEntity> {
    const device = await this.deviceRepository.findOne({
      where: { tenantId, id: id.trim(), boundUserId: userId },
    });
    if (!device) {
      throw new Error(`device not found: ${id}`);
    }
    return device;
  }

  private async mustGetDevice(id: string, tenantId: string): Promise<DeviceEntity> {
    const device = await this.deviceRepository.findOne({ where: { tenantId, id: id.trim() } });
    if (!device) {
      throw new Error(`device not found: ${id}`);
    }
    return device;
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

  private async publishAttrDownlink(
    device: DeviceEntity,
    attrs: Record<string, unknown>,
    requestId: string,
  ): Promise<void> {
    if (Object.keys(attrs).length === 0) {
      return;
    }
    await this.iotDownlinkService.publish({
      vendor: toVendorName(device.provider),
      deviceId: device.deviceSn,
      topicKind: BizIotTopicKind.ATTR_RES,
      requestId,
      tenantId: device.tenantId,
      qos: 1,
      payload: {
        meta: {
          requestId,
          deviceId: device.deviceSn,
          timestamp: Date.now(),
          event: 'attr.set',
          version: '1.0',
        },
        data: {
          attrs,
        },
      },
    });
  }

  private async publishCommandDownlink(
    device: DeviceEntity,
    command: DeviceCommandEntity,
  ): Promise<void> {
    const commandName = normalizeCommandName(command.commandType);
    const requestId = command.id;
    const delivery = await this.iotDownlinkService.publish({
      vendor: toVendorName(device.provider),
      deviceId: device.deviceSn,
      topicKind: BizIotTopicKind.CMD_RES,
      requestId,
      tenantId: device.tenantId,
      qos: 1,
      payload: {
        meta: {
          requestId,
          deviceId: device.deviceSn,
          timestamp: Date.now(),
          event: `cmd.${commandName}`,
          version: '1.0',
        },
        data: {
          command: commandName,
          params: command.payloadJson ?? {},
        },
      },
    });
    await this.updateCommandDeliveryStatus(command, delivery.delivery);
  }

  private async publishOtaUpgradeDownlink(
    device: DeviceEntity,
    command: DeviceCommandEntity,
  ): Promise<void> {
    const payload = command.payloadJson ?? {};
    const requestId = command.id;
    const delivery = await this.iotDownlinkService.publish({
      vendor: toVendorName(device.provider),
      deviceId: device.deviceSn,
      topicKind: BizIotTopicKind.CMD_RES,
      requestId,
      tenantId: device.tenantId,
      qos: 1,
      payload: {
        meta: {
          requestId,
          deviceId: device.deviceSn,
          timestamp: Date.now(),
          event: 'cmd.ota.upgrade',
          version: '1.0',
        },
        data: {
          otaId: command.id,
          firmwareVersion: pickString(payload.targetVersion) ?? null,
          url: pickString(payload.packageUrl) ?? null,
          size: pickNumber(payload.size) ?? null,
          checksum: pickString(payload.checksum) ?? null,
          force: payload.force === true,
          timeout: pickNumber(payload.timeout) ?? 600,
          retry: pickNumber(payload.retry) ?? 3,
        },
      },
    });
    await this.updateCommandDeliveryStatus(command, delivery.delivery);
  }

  private async publishOtaCancelDownlink(
    device: DeviceEntity,
    command: DeviceCommandEntity,
    requestId: string,
  ): Promise<void> {
    const delivery = await this.iotDownlinkService.publish({
      vendor: toVendorName(device.provider),
      deviceId: device.deviceSn,
      topicKind: BizIotTopicKind.CMD_RES,
      requestId,
      tenantId: device.tenantId,
      qos: 1,
      payload: {
        meta: {
          requestId,
          deviceId: device.deviceSn,
          timestamp: Date.now(),
          event: 'cmd.ota.cancel',
          version: '1.0',
        },
        data: {
          otaId: command.id,
        },
      },
    });
    await this.updateCommandDeliveryStatus(command, delivery.delivery);
  }

  private async updateCommandDeliveryStatus(
    command: DeviceCommandEntity,
    delivery: 'queued' | 'sent' | 'skipped',
  ): Promise<void> {
    if (delivery === 'queued') {
      command.status = 'accepted';
      command.failureReason = null;
      await this.deviceCommandService.markCommandAccepted(command.id);
      return;
    }
    if (delivery === 'sent') {
      command.status = 'sent';
      command.sentAt = command.sentAt ?? new Date();
      command.failureReason = null;
      await this.deviceCommandService.markCommandSent(command.id);
      return;
    }
    command.status = 'failed';
    command.failureReason = 'downlink delivery skipped';
    await this.deviceCommandService.markCommandFailed(command.id, 'downlink delivery skipped');
  }

  private toDeviceListItem(
    device: DeviceEntity,
    runtime?: DeviceRuntimeStatusEntity | null,
  ): Record<string, unknown> {
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
      firmwareVersion: runtime?.firmwareVersion ?? null,
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
      createdAt: device.createdAt.toISOString(),
    };
  }

  private toDeviceDetail(
    device: DeviceEntity,
    runtime?: DeviceRuntimeStatusEntity | null,
  ): Record<string, unknown> {
    return {
      ...this.toDeviceListItem(device, runtime),
      updatedAt: toUtcIso(device.updatedAt),
    };
  }

  private async loadRuntimeStatusMap(
    deviceIds: string[],
  ): Promise<Map<string, DeviceRuntimeStatusEntity>> {
    if (deviceIds.length === 0) {
      return new Map();
    }
    const runtimes = await this.deviceRuntimeStatusRepository.find({
      where: deviceIds.map((deviceId) => ({ deviceId })),
    });
    return new Map(runtimes.map((runtime) => [runtime.deviceId, runtime]));
  }

  private toDeviceCredentialDetail(
    device: DeviceEntity,
    credential: DeviceCredentialEntity,
  ): Record<string, unknown> {
    const certificatePem = decryptDeviceCredentialSecret(credential.certificatePem) ?? null;
    const privateKeyPem = decryptDeviceCredentialSecret(credential.privateKeyPem) ?? null;
    const rootCaPem = pickString(asRecord(credential.metadataJson).rootCaPem) ?? null;
    const retrieval = asRecord(credential.metadataJson?.retrieval);
    const claimedAt = pickString(retrieval.claimedAt) ?? null;
    return {
      deviceId: device.id,
      deviceSn: device.deviceSn,
      provider: device.provider,
      available: Boolean(certificatePem || credential.certificateArn || credential.thingName),
      status: credential.status,
      vendor: credential.vendor,
      credentialType: credential.credentialType,
      credentialId: credential.credentialId ?? null,
      thingName: credential.thingName ?? null,
      certificateArn: credential.certificateArn ?? null,
      certificatePem,
      endpoint: credential.endpoint ?? null,
      region: credential.region ?? null,
      fingerprint: credential.fingerprint ?? null,
      rootCaPem,
      issuedAt: credential.issuedAt?.toISOString() ?? null,
      expiresAt: credential.expiresAt?.toISOString() ?? null,
      hasPrivateKey: Boolean(privateKeyPem),
      privateKeyPem,
      hasDeviceSecret: false,
      downloadAvailable: Boolean((certificatePem || privateKeyPem) && !claimedAt),
      claimAvailable: Boolean((certificatePem || privateKeyPem) && !claimedAt),
      claimedAt,
      source: 'device_credentials',
      metadata: credential.metadataJson ?? {},
      productKey: pickString(asRecord(credential.metadataJson).productKey) ?? device.productKey,
      updatedAt: toUtcIso(credential.updatedAt),
    };
  }

  private toUnavailableDeviceCredentialDetail(device: DeviceEntity): Record<string, unknown> {
    return {
      deviceId: device.id,
      deviceSn: device.deviceSn,
      provider: device.provider,
      available: false,
      status: 'unavailable',
      vendor: device.provider,
      credentialType: 'certificate',
      credentialId: null,
      thingName: null,
      certificateArn: null,
      certificatePem: null,
      endpoint: null,
      region: null,
      fingerprint: null,
      rootCaPem: null,
      issuedAt: null,
      expiresAt: null,
      hasPrivateKey: false,
      privateKeyPem: null,
      hasDeviceSecret: false,
      downloadAvailable: false,
      claimAvailable: false,
      claimedAt: null,
      source: 'unavailable',
      productKey: device.productKey,
      metadata: {},
      updatedAt: null,
    };
  }

  private async withIotProvision(
    device: DeviceEntity,
    requestId: string,
    trigger: 'admin.devices.create' | 'devices.create',
  ): Promise<Record<string, unknown>> {
    const provision = await this.deviceIdentityService.provisionOnDeviceCreated({
      deviceId: device.id,
      deviceSn: device.deviceSn,
      provider: device.provider,
      productKey: device.productKey,
      tenantId: device.tenantId,
      requestId,
      trigger,
    });
    return {
      ...this.toDeviceDetail(device),
      iotProvision: provision,
    };
  }

  private buildSkippedProvisionResponse(
    device: DeviceEntity,
    requestId: string,
  ): Record<string, unknown> {
    return {
      ...this.toDeviceDetail(device),
      iotProvision: {
        ok: true,
        skipped: true,
        status: 'existing',
        reason: 'device_already_exists',
        requestId,
      },
    };
  }

  private applyDeviceListFilters(
    qb: ReturnType<Repository<DeviceEntity>['createQueryBuilder']>,
    query: Record<string, unknown>,
    tenantId: string,
    requiredBoundUserId?: string,
  ): void {
    qb.where('device.tenantId = :tenantId', { tenantId });
    if (requiredBoundUserId) {
      qb.andWhere('device.boundUserId = :boundUserId', { boundUserId: requiredBoundUserId });
    }
    const keyword = pickString(query.keyword);
    if (keyword) {
      const escaped = escapeLikeKeyword(keyword);
      qb.andWhere(
        '(device.name ILIKE :keyword ESCAPE \'\\\\\' OR device.deviceSn ILIKE :keyword ESCAPE \'\\\\\' OR device.id ILIKE :keyword ESCAPE \'\\\\\')',
        { keyword: `%${escaped}%` },
      );
    }
    const status = pickString(query.status);
    if (status) {
      qb.andWhere('device.status = :status', { status });
    }
    const onlineStatus = pickString(query.onlineStatus);
    if (onlineStatus) {
      qb.andWhere('device.onlineStatus = :onlineStatus', { onlineStatus });
    }
    const provider = pickString(query.provider);
    if (provider) {
      qb.andWhere('device.provider = :provider', { provider });
    }
    const boundUserId = pickString(query.boundUserId);
    if (boundUserId && !requiredBoundUserId) {
      qb.andWhere('device.boundUserId = :boundUserId', { boundUserId });
    }
    if (query.boundUserId === null && !requiredBoundUserId) {
      qb.andWhere('device.boundUserId IS NULL');
    }
  }

  private async createOrUpsertDevice(input: {
    tenantId: string;
    name: string;
    deviceSn: string;
    productKey: string;
    provider: string;
    status: string;
    onlineStatus: string;
    boundUserId: null | string;
    locale: string;
    market: string;
    requestId: string;
  }): Promise<{ entity: DeviceEntity; state: 'created' | 'reused' | 'updated' }> {
    const existing = await this.deviceRepository.findOne({
      where: { tenantId: input.tenantId, deviceSn: input.deviceSn },
    });

    if (existing) {
      const needsUpdate =
        existing.provider !== input.provider
        || existing.status !== input.status
        || existing.onlineStatus !== input.onlineStatus
        || normalizeNullable(existing.boundUserId) !== normalizeNullable(input.boundUserId);
      if (!needsUpdate) {
        return { entity: existing, state: 'reused' };
      }
      existing.name = input.name;
      existing.productKey = input.productKey;
      existing.provider = input.provider;
      existing.status = input.status;
      existing.onlineStatus = input.onlineStatus;
      existing.boundUserId = input.boundUserId;
      existing.locale = input.locale;
      existing.market = input.market;
      existing.lastSeenAt = null;
      const saved = await this.deviceRepository.save(existing);
      if (!input.boundUserId) {
        await this.deviceBindingService.closeActiveBindings(input.tenantId, saved.id, input.requestId);
      }
      return { entity: saved, state: 'updated' };
    }

    const created = await this.deviceRepository.save(
      this.deviceRepository.create({
        tenantId: input.tenantId,
        name: input.name,
        deviceSn: input.deviceSn,
        productKey: input.productKey,
        provider: input.provider,
        status: input.status,
        onlineStatus: input.onlineStatus,
        boundUserId: input.boundUserId,
        locale: input.locale,
        market: input.market,
      }),
    );
    return { entity: created, state: 'created' };
  }
}

type ConsumableDeviceCredentialDetail = {
  certificateArn: null | string;
  certificatePem: null | string;
  credentialId?: null | string;
  deviceId: string;
  deviceSn: string;
  endpoint: null | string;
  privateKeyPem: null | string;
  productKey?: null | string;
  region: null | string;
  rootCaPem?: null | string;
  thingName: null | string;
  vendor: null | string;
};

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

function pickBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

function normalizeNullable(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  return value == null ? null : String(value);
}

function normalizePage(value: unknown): number {
  const parsed = pickNumber(value);
  if (!parsed) {
    return 1;
  }
  return Math.max(1, Math.floor(parsed));
}

function normalizePageSize(value: unknown): number {
  const parsed = pickNumber(value);
  if (!parsed) {
    return 20;
  }
  return Math.min(100, Math.max(1, Math.floor(parsed)));
}

function escapeLikeKeyword(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function normalizeCommandName(commandType: string): string {
  const trimmed = commandType.trim();
  if (trimmed.startsWith('cmd.')) {
    return trimmed.slice(4);
  }
  if (trimmed === 'ota_upgrade') {
    return 'ota.upgrade';
  }
  if (trimmed === 'ota_cancel') {
    return 'ota.cancel';
  }
  return trimmed;
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

function toVendorName(provider: string): 'aws' | 'emqx' {
  const normalized = provider.trim().toLowerCase();
  if (normalized === 'emqx') {
    return 'emqx';
  }
  return 'aws';
}

function requireUserId(user: AuthenticatedUser | null): string {
  const userId = pickString(user?.userId);
  if (!userId) {
    throw new Error('authenticated user is required');
  }
  return userId;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function resolveDeviceRegistrationContext(input: Record<string, unknown>): {
  locale: string;
} {
  const locale =
    pickString(input.locale)
    ?? getDefaultLocale();
  return {
    locale,
  };
}

async function saveConsumedCredential(
  credentialRepository: Repository<DeviceCredentialEntity>,
  credential: DeviceCredentialEntity,
  method: 'copy' | 'download',
  _requestId: string,
): Promise<void> {
  const claimedAt = new Date().toISOString();
  credential.metadataJson = {
    ...(credential.metadataJson ?? {}),
    retrieval: {
      ...asRecord(credential.metadataJson?.retrieval),
      method,
      claimedAt,
    },
  };
  await credentialRepository.save(credential);
}
