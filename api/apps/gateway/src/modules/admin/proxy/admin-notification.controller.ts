import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import { AdminPermissionGuard } from '../auth/admin-permission.guard';
import { AdminPermission } from '../auth/admin-permission.decorator';
import type { AdminPageQueryDto } from '../dto/admin-common.dto';
import { normalizeAdminPaged } from '../admin-response.util';
import {
  BaseNotificationGrpcAdapter,
  BaseSystemAdminGrpcAdapter,
} from '../../../grpc/base-service.grpc-client';
import { GrpcInvokerService } from '../../grpc-invoker.service';

@UseGuards(AdminJwtGuard, AdminPermissionGuard)
@ApiTags('后台通知管理接口')
@ApiBearerAuth('bearer')
@Controller('api/admin')
export class AdminNotificationController {
  private readonly logger = new Logger(AdminNotificationController.name);

  constructor(
    @Inject(GrpcInvokerService) private readonly grpcInvoker: GrpcInvokerService,
    @Inject(BaseNotificationGrpcAdapter)
    private readonly baseNotificationGrpcAdapter: BaseNotificationGrpcAdapter,
    @Inject(BaseSystemAdminGrpcAdapter)
    private readonly baseSystemAdminGrpcAdapter: BaseSystemAdminGrpcAdapter,
  ) {}

  @Get('notifications')
  @AdminPermission('notification.message:read')
  @ApiOperation({ summary: '查询通知发送记录' })
  listNotifications(@Req() req: any, @Query() query: AdminPageQueryDto) {
    return this.notification(req, 'admin.notifications.list', { ...query }, true);
  }

  @Post('notifications/test')
  @AdminPermission('notification.message:test')
  @ApiOperation({ summary: '发送测试通知' })
  async sendTestNotification(@Req() req: any, @Body() body: Record<string, unknown>) {
    const result = await this.notification(req, 'admin.notifications.test', {}, false, body);
    await this.writeAdminAuditLog(req, {
      action: 'notification-message.test',
      resourceType: 'notification_message',
      resourceId: pickString(result.id),
      after: {
        title: pickString(body.title) ?? null,
        templateCode: pickString(body.templateCode) ?? pickString(body.template_code) ?? null,
        userId: pickString(body.userId) ?? pickString(body.user_id) ?? null,
        resultId: pickString(result.id) ?? null,
        status: pickString(result.status) ?? null,
      },
    });
    return result;
  }

  @Get('templates')
  @AdminPermission('notification.template:read')
  @ApiOperation({ summary: '查询通知模板列表' })
  listTemplates(@Req() req: any) {
    return this.notification(req, 'admin.templates.list');
  }

  @Post('templates')
  @AdminPermission('notification.template:update')
  async createTemplate(@Req() req: any, @Body() body: Record<string, unknown>) {
    const result = await this.notification(req, 'admin.templates.create', {}, false, body);
    await this.writeAdminAuditLog(req, {
      action: 'notification-template.create',
      resourceType: 'notification_template',
      resourceId: pickString(result.id),
      after: sanitizeAuditObject(result, body),
    });
    return result;
  }

  @Patch('templates/:id')
  @AdminPermission('notification.template:update')
  async updateTemplate(@Req() req: any, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const result = await this.notification(req, 'admin.templates.update', { id }, false, body);
    await this.writeAdminAuditLog(req, {
      action: 'notification-template.update',
      resourceType: 'notification_template',
      resourceId: id,
      after: sanitizeAuditObject(result, { id, ...body }),
    });
    return result;
  }

  @Get('device-tokens')
  @AdminPermission('notification.device-token:read')
  @ApiOperation({ summary: '查询设备推送令牌列表' })
  listDeviceTokens(@Req() req: any) {
    return this.notification(req, 'admin.deviceTokens.list');
  }

  private async notification(
    req: any,
    operation: string,
    params: Record<string, unknown> = {},
    paged = false,
    body: Record<string, unknown> = {},
  ) {
    const result = await this.grpcInvoker.invoke({
      service: 'base-service',
      operation,
      requestId: req.requestId,
      call: () => this.baseNotificationGrpcAdapter.execute({
        operation,
        params,
        query: params,
        body,
        requestId: req.requestId,
      }),
    });
    return paged ? normalizeAdminPaged(result) : result;
  }

  private async writeAdminAuditLog(
    req: any,
    input: {
      action: string;
      resourceType: string;
      resourceId?: string;
      after?: Record<string, unknown>;
      before?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      await this.baseSystemAdminGrpcAdapter.call(
        'auditLogs',
        'CreateAuditLog',
        {
          tenantId: req.user?.tenantId ?? null,
          operatorId: req.user?.userId ?? 'system',
          operatorName:
            pickString(req.user?.nickname)
            ?? pickString(req.user?.username)
            ?? pickString(req.user?.userId)
            ?? 'system',
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId ?? null,
          before: input.before ?? null,
          after: input.after ?? null,
        },
        req.requestId,
      );
    } catch (error) {
      this.logger.warn(
        `failed to write admin audit log: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function sanitizeAuditObject(...values: unknown[]): Record<string, unknown> {
  for (const value of values) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return {};
}
