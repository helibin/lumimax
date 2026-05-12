import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createPagedResult } from '@lumimax/http-kit';
import { generateId } from '@lumimax/runtime';
import { buildGatewayGrpcSuccess } from '@lumimax/integration/grpc/gateway-grpc.util';
import type { Repository } from 'typeorm';
import {
  DeviceTokenEntity,
  NotificationMessageEntity,
  NotificationTemplateEntity,
} from './notification.entities';

@Injectable()
export class NotificationFacadeService {
  constructor(
    @InjectRepository(NotificationMessageEntity)
    private readonly notificationMessageRepository: Repository<NotificationMessageEntity>,
    @InjectRepository(NotificationTemplateEntity)
    private readonly notificationTemplateRepository: Repository<NotificationTemplateEntity>,
    @InjectRepository(DeviceTokenEntity)
    private readonly deviceTokenRepository: Repository<DeviceTokenEntity>,
  ) {}

  execute(input: {
    operation: string;
    params: Record<string, unknown>;
    query: Record<string, unknown>;
    body: Record<string, unknown>;
    tenantScope?: string;
    requestId: string;
  }) {
    if (input.operation === 'admin.notifications.list') {
      return this.listNotifications(input);
    }
    if (input.operation === 'admin.notifications.test') {
      return this.sendTestNotification(input);
    }
    if (input.operation === 'admin.templates.list') {
      return this.listTemplates(input);
    }
    if (input.operation === 'admin.templates.create') {
      return this.createTemplate(input);
    }
    if (input.operation === 'admin.templates.update') {
      return this.updateTemplate(input);
    }
    if (input.operation === 'admin.deviceTokens.list') {
      return this.listDeviceTokens(input);
    }
    if (input.operation === 'internal.notifications.otp.send') {
      return this.sendOtpNotification(input);
    }
    throw new Error(`Unsupported notification operation: ${input.operation}`);
  }

  private async listNotifications(input: {
    query: Record<string, unknown>;
    tenantScope?: string;
    requestId: string;
  }) {
    const query = input.query ?? {};
    const page = Math.max(1, pickNumber(query.page) ?? 1);
    const pageSize = Math.max(1, Math.min(100, pickNumber(query.pageSize) ?? 20));
    const qb = this.notificationMessageRepository.createQueryBuilder('message');
    const userId = pickString(query.userId);
    const tenantId = input.tenantScope?.trim() || pickString(query.tenantId);
    if (userId) {
      qb.andWhere('message.user_id = :userId', { userId });
    }
    if (tenantId) {
      qb.andWhere('message.tenant_id = :tenantId', { tenantId });
    }
    const [items, total] = await qb
      .orderBy('message.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return buildReply(
      createPagedResult(
        items.map((item) => toNotificationMessageDto(item)),
        page,
        pageSize,
        total,
      ) as unknown as Record<string, unknown>,
      input.requestId,
    );
  }

  private async sendTestNotification(input: {
    body: Record<string, unknown>;
    tenantScope?: string;
    requestId: string;
  }) {
    const body = input.body ?? {};
    const userId = pickString(body.userId);
    const eventName = pickString(body.eventName);
    const templateCode = pickString(body.templateCode);
    const payload = pickObject(body.payload) ?? {};
    if (!userId || !eventName || !templateCode) {
      throw new Error('userId, eventName and templateCode are required');
    }

    const title = pickString(payload.title) ?? `[test] ${templateCode}`;
    const content =
      pickString(payload.content) ??
      pickString(payload.message) ??
      JSON.stringify(payload);

    const created = await this.notificationMessageRepository.save(
      this.notificationMessageRepository.create({
        id: generateId(),
        userId,
        tenantId: input.tenantScope?.trim() || pickString(body.tenantId) || null,
        eventName,
        templateCode,
        title,
        content,
        payload,
        status: 'sent',
        scheduledAt: null,
      }),
    );
    return buildReply(toNotificationMessageDto(created), input.requestId);
  }

  private async listTemplates(input: {
    query?: Record<string, unknown>;
    tenantScope?: string;
    requestId: string;
  }) {
    const tenantId = input.tenantScope?.trim() || pickString(input.query?.tenantId);
    const items = await this.notificationTemplateRepository.find({
      where: tenantId ? { tenantId } : {},
      order: { createdAt: 'DESC' },
    });
    return buildReply(
      { items: items.map((item) => toNotificationTemplateDto(item)) },
      input.requestId,
    );
  }

  private async createTemplate(input: {
    body: Record<string, unknown>;
    tenantScope?: string;
    requestId: string;
  }) {
    const body = input.body ?? {};
    const code = pickString(body.code);
    const channel = pickNotificationChannel(body.channel);
    const locale = pickString(body.locale) ?? 'zh-CN';
    const titleTemplate = pickString(body.titleTemplate);
    const contentTemplate = pickString(body.contentTemplate);
    if (!code || !channel || !titleTemplate || !contentTemplate) {
      throw new Error('code, channel, titleTemplate and contentTemplate are required');
    }

    const created = await this.notificationTemplateRepository.save(
      this.notificationTemplateRepository.create({
        id: generateId(),
        tenantId: input.tenantScope?.trim() || pickString(body.tenantId) || null,
        code,
        channel,
        locale,
        titleTemplate,
        contentTemplate,
        variablesSchema: pickObject(body.variablesSchema) ?? {},
        isEnabled: pickBoolean(body.isEnabled) ?? true,
      }),
    );
    return buildReply(toNotificationTemplateDto(created), input.requestId);
  }

  private async updateTemplate(input: {
    params: Record<string, unknown>;
    body: Record<string, unknown>;
    tenantScope?: string;
    requestId: string;
  }) {
    const params = input.params ?? {};
    const body = input.body ?? {};
    const id = pickString(params.id);
    const tenantId = input.tenantScope?.trim() || pickString(body.tenantId) || undefined;
    if (!id) {
      throw new Error('template id is required');
    }

    const existed = await this.notificationTemplateRepository.findOne({
      where: tenantId ? { id, tenantId } : { id },
    });
    if (!existed) {
      throw new NotFoundException(`Template ${id} not found`);
    }

    if (body.titleTemplate !== undefined) {
      existed.titleTemplate = pickString(body.titleTemplate) ?? existed.titleTemplate;
    }
    if (body.contentTemplate !== undefined) {
      existed.contentTemplate = pickString(body.contentTemplate) ?? existed.contentTemplate;
    }
    if (body.variablesSchema !== undefined) {
      existed.variablesSchema = pickObject(body.variablesSchema) ?? {};
    }
    if (body.isEnabled !== undefined) {
      const isEnabled = pickBoolean(body.isEnabled);
      if (isEnabled === undefined) {
        throw new Error('isEnabled must be a boolean');
      }
      existed.isEnabled = isEnabled;
    }

    const saved = await this.notificationTemplateRepository.save(existed);
    return buildReply(toNotificationTemplateDto(saved), input.requestId);
  }

  private async listDeviceTokens(input: {
    query: Record<string, unknown>;
    tenantScope?: string;
    requestId: string;
  }) {
    const tenantId = input.tenantScope?.trim() || pickString(input.query.tenantId);
    const items = await this.deviceTokenRepository.find({
      where: tenantId ? { tenantId } : {},
      order: { createdAt: 'DESC' },
    });
    return buildReply(
      { items: items.map((item) => toDeviceTokenDto(item)) },
      input.requestId,
    );
  }

  private async sendOtpNotification(input: {
    body: Record<string, unknown>;
    tenantScope?: string;
    requestId: string;
  }) {
    const body = input.body ?? {};
    const userId = pickString(body.userId);
    const verifyType = pickVerifyType(body.verifyType);
    if (!userId || !verifyType) {
      throw new Error('userId and verifyType are required');
    }

    const otpCode = pickString(body.otpCode) ?? pickString(body.code) ?? '';
    const account = pickString(body.account) ?? '';
    const templateCode = verifyType === 'email' ? 'otp_email' : 'otp_sms';
    const title = verifyType === 'email' ? 'OTP Email Verification' : 'OTP SMS Verification';
    const content = otpCode
      ? `Your verification code is ${otpCode}`
      : 'A verification code has been requested';

    const created = await this.notificationMessageRepository.save(
      this.notificationMessageRepository.create({
        id: generateId(),
        userId,
        tenantId: input.tenantScope?.trim() || null,
        eventName: 'notification.otp.send',
        templateCode,
        title,
        content,
        payload: {
          ...body,
          channel: verifyType === 'email' ? 'email' : 'sms',
          target: account,
        },
        status: 'sent',
        scheduledAt: null,
      }),
    );

    return buildReply(toNotificationMessageDto(created), input.requestId);
  }
}

function buildReply(data: Record<string, unknown>, requestId: string) {
  return buildGatewayGrpcSuccess(data, requestId);
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

function pickBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return undefined;
}

function pickObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function pickNotificationChannel(value: unknown) {
  return value === 'push' ||
    value === 'email' ||
    value === 'sms' ||
    value === 'webhook'
    ? value
    : undefined;
}

function pickVerifyType(value: unknown): 'phone' | 'email' | undefined {
  return value === 'phone' || value === 'email' ? value : undefined;
}

function toNotificationMessageDto(entity: NotificationMessageEntity): Record<string, unknown> {
  return {
    id: entity.id,
    userId: entity.userId,
    tenantId: entity.tenantId,
    eventName: entity.eventName,
    templateCode: entity.templateCode,
    title: entity.title,
    content: entity.content,
    status: entity.status,
    createdAt: entity.createdAt,
  };
}

function toNotificationTemplateDto(entity: NotificationTemplateEntity): Record<string, unknown> {
  return {
    id: entity.id,
    code: entity.code,
    channel: entity.channel,
    locale: entity.locale,
    titleTemplate: entity.titleTemplate,
    contentTemplate: entity.contentTemplate,
    variablesSchema: entity.variablesSchema ?? {},
    isEnabled: entity.isEnabled,
  };
}

function toDeviceTokenDto(entity: DeviceTokenEntity): Record<string, unknown> {
  return {
    id: entity.id,
    userId: entity.userId,
    platform: entity.platform,
    provider: entity.provider,
    token: entity.token,
    appId: entity.appId,
    region: entity.region,
    locale: entity.locale,
    isActive: entity.isActive,
  };
}
