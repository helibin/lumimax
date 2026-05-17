import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserType, type AuthenticatedUser } from '@lumimax/auth';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import { AdminPermissionGuard } from '../auth/admin-permission.guard';
import { AdminPermission } from '../auth/admin-permission.decorator';
import {
  BaseStorageGrpcAdapter,
  BaseSystemAdminGrpcAdapter,
} from '../../../grpc/base-service.grpc-client';
import {
  BizDeviceGrpcAdapter,
  BizDietGrpcAdapter,
  BizIotBridgeGrpcAdapter,
} from '../../../grpc/biz-service.grpc-client';
import { GrpcInvokerService } from '../../grpc-invoker.service';
import { resolveTenantScope } from '../../../controllers/controller-context.util';
import { assertGatewayIotHttpUplinkIngestAllowed } from '../../iot/gateway-iot-uplink-guard';
import { normalizeIotWebhookBody } from '../../iot/gateway-iot-webhook.util';

@UseGuards(AdminJwtGuard, AdminPermissionGuard)
@ApiTags('后台调试中心')
@ApiBearerAuth('bearer')
@Controller('api/admin/debug')
export class AdminDebugController {
  private readonly logger = new Logger(AdminDebugController.name);

  constructor(
    @Inject(GrpcInvokerService) private readonly grpcInvoker: GrpcInvokerService,
    @Inject(BaseStorageGrpcAdapter) private readonly baseStorageGrpcAdapter: BaseStorageGrpcAdapter,
    @Inject(BizDeviceGrpcAdapter) private readonly bizDeviceGrpcAdapter: BizDeviceGrpcAdapter,
    @Inject(BizDietGrpcAdapter) private readonly bizDietGrpcAdapter: BizDietGrpcAdapter,
    @Inject(BizIotBridgeGrpcAdapter) private readonly bizIotBridgeGrpcAdapter: BizIotBridgeGrpcAdapter,
    @Inject(BaseSystemAdminGrpcAdapter)
    private readonly baseSystemAdminGrpcAdapter: BaseSystemAdminGrpcAdapter,
  ) {}

  @Post('device-protocol/upload-url')
  @AdminPermission('debug:center:execute')
  @ApiOperation({ summary: '设备协议：申请上传地址 (upload.url.request)' })
  deviceProtocolUploadUrl(@Req() req: any, @Body() body: Record<string, unknown>) {
    return this.invokeDevice(req, 'admin.debug.deviceProtocol.uploadUrl', {}, {}, body);
  }

  @Post('device-protocol/food-recognition')
  @AdminPermission('debug:center:execute')
  @ApiOperation({
    summary: '设备协议：食品识别链路 (meal.record.create + food.analysis.request)',
  })
  deviceProtocolFoodRecognition(@Req() req: any, @Body() body: Record<string, unknown>) {
    return this.invokeDevice(req, 'admin.debug.deviceProtocol.foodRecognition', {}, {}, body);
  }

  @Post('storage/upload-token')
  @AdminPermission('debug:center:execute')
  @ApiOperation({ summary: '创建调试上传凭证' })
  createUploadToken(@Req() req: any, @Body() body: Record<string, unknown>) {
    const user = buildTargetUser(req.user as AuthenticatedUser, body, { requireUserId: true });
    const tenantScope = resolveTenantScope(req, user);
    const deviceScoped = body.ownerType === 'device';
    const nextBody = {
      ...body,
      userId: deviceScoped ? undefined : user.userId,
      deviceId: pickString(body.deviceId),
    };
    return this.grpcInvoker.invoke({
      service: 'base-service',
      operation: 'storage.objects.createUploadToken',
      requestId: req.requestId,
      call: () =>
        this.baseStorageGrpcAdapter.execute({
          operation: 'storage.objects.createUploadToken',
          body: nextBody,
          user,
          tenantScope,
          requestId: req.requestId,
        }),
    });
  }

  @Post('storage/confirm')
  @AdminPermission('debug:center:execute')
  @ApiOperation({ summary: '确认调试上传完成' })
  confirmUpload(@Req() req: any, @Body() body: Record<string, unknown>) {
    const user = buildTargetUser(req.user as AuthenticatedUser, body, { requireUserId: true });
    const tenantScope = resolveTenantScope(req, user);
    return this.grpcInvoker.invoke({
      service: 'base-service',
      operation: 'storage.objects.confirm',
      requestId: req.requestId,
      call: () =>
        this.baseStorageGrpcAdapter.execute({
          operation: 'storage.objects.confirm',
          body: {
            ...body,
            userId: user.userId,
          },
          user,
          tenantScope,
          requestId: req.requestId,
        }),
    });
  }

  @Post('meals')
  @AdminPermission('debug:center:execute')
  @ApiOperation({ summary: '创建调试用餐记录' })
  createMeal(@Req() req: any, @Body() body: Record<string, unknown>) {
    return this.invokeDiet(req, 'meals.create', {}, {}, body);
  }

  @Post('meals/:id/analyze')
  @AdminPermission('debug:center:execute')
  @ApiOperation({ summary: '调试食物识别' })
  analyzeMeal(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.invokeDiet(req, 'meals.items.analyze', { id }, {}, body);
  }

  @Post('meals/:id/finish')
  @AdminPermission('debug:center:execute')
  @ApiOperation({ summary: '结束调试用餐记录' })
  finishMeal(@Req() req: any, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.invokeDiet(req, 'meals.finish', { id }, {}, body);
  }

  @Get('foods/suggest')
  @AdminPermission('debug:center:execute')
  @ApiOperation({ summary: '调试食物名称建议' })
  suggestFoods(@Req() req: any, @Query() query: Record<string, unknown>) {
    return this.invokeDiet(req, 'foods.suggest', {}, query, {});
  }

  @Post('iot/ingest')
  @AdminPermission('debug:center:execute')
  @ApiOperation({ summary: '模拟设备上行消息入库' })
  async ingestIotMessage(@Req() req: any, @Body() body: Record<string, unknown>) {
    assertGatewayIotHttpUplinkIngestAllowed();
    const vendor = pickString(body.vendor) ?? 'emqx';
    const topic = pickString(body.topic);
    const payload = body.payload;
    let normalized: { topic: string; payload: Record<string, unknown>; receivedAt?: number };
    if (topic && payload && typeof payload === 'object' && !Array.isArray(payload)) {
      normalized = {
        topic,
        payload: payload as Record<string, unknown>,
        receivedAt: pickNumber(body.receivedAt),
      };
    } else {
      const webhookBody =
        body.webhook && typeof body.webhook === 'object' && !Array.isArray(body.webhook)
          ? (body.webhook as Record<string, unknown>)
          : body;
      normalized = normalizeIotWebhookBody(vendor, webhookBody);
    }
    const result = await this.grpcInvoker.invoke({
      service: 'biz-service',
      operation: 'IngestCloudMessage',
      requestId: req.requestId,
      call: () =>
        this.bizIotBridgeGrpcAdapter.ingestCloudMessage({
          topic: normalized.topic,
          payload: normalized.payload,
          receivedAt: normalized.receivedAt,
          requestId: req.requestId,
        }),
    });
    await this.writeAdminAuditLog(req, {
      action: 'debug.iot.ingest',
      resourceType: 'iot_message',
      after: {
        vendor,
        topic: normalized.topic,
        success: result.success,
        message: result.message,
      },
    });
    return result;
  }

  private invokeDevice(
    req: any,
    operation: string,
    params: Record<string, unknown> = {},
    query: Record<string, unknown> = {},
    body: Record<string, unknown> = {},
  ) {
    return this.grpcInvoker.invoke({
      service: 'biz-service',
      operation,
      requestId: req.requestId,
      call: () =>
        this.bizDeviceGrpcAdapter.execute({
          operation,
          params,
          query,
          body,
          user: req.user as AuthenticatedUser,
          requestId: req.requestId,
        }),
    });
  }

  private invokeDiet(
    req: any,
    operation: string,
    params: Record<string, unknown> = {},
    query: Record<string, unknown> = {},
    body: Record<string, unknown> = {},
  ) {
    const user = buildTargetUser(req.user as AuthenticatedUser, body, { requireUserId: true });
    const tenantScope = resolveTenantScope(req, user);
    return this.grpcInvoker.invoke({
      service: 'biz-service',
      operation,
      requestId: req.requestId,
      call: () =>
        this.bizDietGrpcAdapter.execute({
          operation,
          params,
          query,
          body,
          user,
          tenantScope,
          requestId: req.requestId,
        }),
    });
  }

  private async writeAdminAuditLog(
    req: any,
    input: {
      action: string;
      resourceType: string;
      resourceId?: string;
      after?: Record<string, unknown>;
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
          before: null,
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

function buildTargetUser(
  adminUser: AuthenticatedUser,
  body: Record<string, unknown>,
  options?: { requireUserId?: boolean },
): AuthenticatedUser {
  const userId = pickString(body.userId) ?? pickString(body.user_id);
  if (!userId && options?.requireUserId) {
    throw new BadRequestException('userId is required');
  }
  if (!userId) {
    return adminUser;
  }
  return {
    ...adminUser,
    userId,
    tenantId: pickString(body.tenantId) ?? pickString(body.tenant_id) ?? adminUser.tenantId,
    type: UserType.CUSTOMER,
  };
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
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
