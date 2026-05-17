import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '@lumimax/auth';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import { AdminPermissionGuard } from '../auth/admin-permission.guard';
import { AdminPermission } from '../auth/admin-permission.decorator';
import { AdminPageQueryDto, AdminStatusBodyDto } from '../dto/admin-common.dto';
import {
  BaseSystemAdminGrpcAdapter,
  BaseUserGrpcAdapter,
} from '../../../grpc/base-service.grpc-client';
import {
  BizDeviceGrpcAdapter,
  BizDietAdminGrpcAdapter,
  BizIotAdminGrpcAdapter,
} from '../../../grpc/biz-service.grpc-client';
import { GrpcInvokerService } from '../../grpc-invoker.service';
import { normalizeAdminPaged } from '../admin-response.util';

void AdminPageQueryDto;
void AdminStatusBodyDto;
void BaseSystemAdminGrpcAdapter;
void BaseUserGrpcAdapter;
void BizDeviceGrpcAdapter;
void BizDietAdminGrpcAdapter;
void BizIotAdminGrpcAdapter;
void GrpcInvokerService;

@UseGuards(AdminJwtGuard, AdminPermissionGuard)
@ApiTags('后台业务管理接口')
@ApiBearerAuth('bearer')
@Controller('api/admin')
export class AdminBusinessController {
  private readonly logger = new Logger(AdminBusinessController.name);

  constructor(
    private readonly grpcInvoker: GrpcInvokerService,
    private readonly baseSystemAdminGrpcAdapter: BaseSystemAdminGrpcAdapter,
    private readonly baseUserGrpcAdapter: BaseUserGrpcAdapter,
    private readonly bizDeviceGrpcAdapter: BizDeviceGrpcAdapter,
    private readonly bizDietAdminGrpcAdapter: BizDietAdminGrpcAdapter,
    private readonly bizIotAdminGrpcAdapter: BizIotAdminGrpcAdapter,
  ) {}

  @Get('dashboard/overview')
  @AdminPermission('dashboard:view')
  @ApiOperation({ summary: '后台概览看板' })
  async dashboard(@Req() req: any) {
    const [bizOverview, baseOverview] = await Promise.all([
      this.grpcInvoker.invoke<Record<string, unknown>>({
        service: 'biz-service',
        operation: 'admin.dashboard.overview',
        requestId: req.requestId,
        call: () => this.bizDeviceGrpcAdapter.execute({
          operation: 'admin.dashboard.overview',
          user: req.user as AuthenticatedUser,
          requestId: req.requestId,
        }),
      }),
      this.grpcInvoker.invoke<Record<string, unknown>>({
        service: 'base-service',
        operation: 'admin.dashboard.overview',
        requestId: req.requestId,
        call: () => this.baseSystemAdminGrpcAdapter.call(
          'dashboard',
          'GetOverview',
          {},
          req.requestId,
        ),
      }),
    ]);

    return {
      ...bizOverview,
      ...baseOverview,
      todayNewUsers: pickNumber(baseOverview.todayNewUsers) ?? 0,
      systemServiceStatus:
        pickString(baseOverview.systemServiceStatus)
        ?? pickString(bizOverview.systemServiceStatus)
        ?? 'ok',
    };
  }

  @Get('users')
  @AdminPermission('user:view')
  @ApiOperation({ summary: '查询 C 端用户列表' })
  listUsers(@Req() req: any, @Query() query: AdminPageQueryDto) {
    return this.user(req, 'admin.users.list', {}, { ...query }, {}, true);
  }

  @Get('users/:id')
  @AdminPermission('user:view')
  getUser(@Req() req: any, @Param('id') id: string) {
    return this.user(req, 'admin.users.get', { id });
  }

  @Patch('users/:id/status')
  @AdminPermission('user:update')
  async updateUserStatus(@Req() req: any, @Param('id') id: string, @Body() body: AdminStatusBodyDto) {
    const before = await this.loadUserSnapshot(req, id);
    const result = await this.user(req, 'admin.users.update', { id }, {}, { status: body.status });
    await this.writeAdminAuditLog(req, {
      action: 'user.status',
      resourceType: 'user',
      resourceId: id,
      before,
      after: {
        id,
        status: body.status,
        result,
      },
    });
    return result;
  }

  @Get('devices')
  @AdminPermission('device:view')
  @ApiOperation({ summary: '查询设备列表' })
  listDevices(@Req() req: any, @Query() query: AdminPageQueryDto) {
    return this.device(req, 'admin.devices.list', {}, { ...query }, {}, true);
  }

  @Get('devices/:id')
  @AdminPermission('device:view')
  getDevice(@Req() req: any, @Param('id') id: string) {
    return this.device(req, 'admin.devices.get', { id });
  }

  @Get('devices/:id/credential')
  @AdminPermission('device:credential:view')
  @ApiOperation({ summary: '查询设备凭据信息' })
  async getDeviceCredential(@Req() req: any, @Param('id') id: string) {
    const result = await this.device(req, 'admin.devices.credential.get', { id });
    await this.writeAdminAuditLog(req, {
      action: 'device-credential.view',
      resourceType: 'device_credential',
      resourceId: id,
      after: {
        deviceId: id,
        available: result.available ?? null,
        thingName: result.thingName ?? null,
        certificateArn: result.certificateArn ?? null,
      },
    });
    return result;
  }

  @Get('devices/:id/credential/download')
  @AdminPermission('device:credential:download')
  @ApiOperation({ summary: '下载设备凭据包' })
  async downloadDeviceCredential(@Req() req: any, @Param('id') id: string, @Res() res: any) {
    const result = await this.device(req, 'admin.devices.credential.download', { id });
    const fileName = pickString(result.fileName) ?? `device-${id}-credential-package.tar.gz`;
    const contentBase64 = pickString(result.contentBase64);
    if (!contentBase64) {
      throw new Error('device credential package content is empty');
    }
    await this.writeAdminAuditLog(req, {
      action: 'device-credential.download',
      resourceType: 'device_credential',
      resourceId: id,
      after: {
        deviceId: id,
        fileName,
        size: result.size ?? null,
        thingName: result.thingName ?? null,
        certificateArn: result.certificateArn ?? null,
      },
    });
    res.setHeader('Content-Type', pickString(result.mimeType) ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(Buffer.from(contentBase64, 'base64'));
  }

  @Post('devices/:id/credential/claim')
  @AdminPermission('device:credential:download')
  @ApiOperation({ summary: '一次性领取设备凭据' })
  async claimDeviceCredential(@Req() req: any, @Param('id') id: string) {
    const result = await this.device(req, 'admin.devices.credential.claim', { id });
    await this.writeAdminAuditLog(req, {
      action: 'device-credential.claim',
      resourceType: 'device_credential',
      resourceId: id,
      after: {
        deviceId: id,
        thingName: result.thingName ?? null,
        certificateArn: result.certificateArn ?? null,
        claimedAt: result.claimedAt ?? null,
      },
    });
    return result;
  }

  @Post('devices/:id/credential/rotate')
  @AdminPermission('device:credential:rotate')
  @ApiOperation({ summary: '触发设备凭据轮换' })
  async rotateDeviceCredential(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const result = await this.device(req, 'admin.devices.credential.rotate', { id }, {}, body);
    await this.writeAdminAuditLog(req, {
      action: 'device-credential.rotate',
      resourceType: 'device_credential',
      resourceId: id,
      after: {
        deviceId: id,
        status: result.status ?? null,
        vendor: result.vendor ?? null,
        recordId: result.recordId ?? null,
      },
    });
    return result;
  }

  @Delete('devices/:id')
  @AdminPermission('device:delete')
  async deleteDevice(@Req() req: any, @Param('id') id: string) {
    const before = await this.loadDeviceSnapshot(req, id);
    const result = await this.device(req, 'admin.devices.delete', { id });
    await this.writeAdminAuditLog(req, {
      action: 'device.delete',
      resourceType: 'device',
      resourceId: id,
      before,
      after: {
        id,
        deleted: true,
        result,
      },
    });
    return result;
  }

  @Post('devices')
  @AdminPermission('device:create')
  async createDevice(@Req() req: any, @Body() body: Record<string, unknown>) {
    const result = await this.device(req, 'admin.devices.create', {}, {}, body);
    const resultPayload = asRecord(result);
    await this.writeAdminAuditLog(req, {
      action: 'device.create',
      resourceType: 'device',
      resourceId: pickString(resultPayload.id) ?? pickString(resultPayload.deviceId),
      after: sanitizeAuditObject(result, body),
    });
    return result;
  }

  @Post('devices/:id/bind')
  @AdminPermission('device:update')
  async bindDevice(@Req() req: any, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const before = await this.loadDeviceSnapshot(req, id);
    const result = await this.device(req, 'admin.devices.bind', { id }, {}, body);
    await this.writeAdminAuditLog(req, {
      action: 'device.bind',
      resourceType: 'device',
      resourceId: id,
      before,
      after: sanitizeAuditObject(result, { id, ...body }),
    });
    return result;
  }

  @Patch('devices/:id/status')
  @AdminPermission('device:update')
  async updateDeviceStatus(@Req() req: any, @Param('id') id: string, @Body() body: AdminStatusBodyDto) {
    const before = await this.loadDeviceSnapshot(req, id);
    const result = await this.device(req, 'admin.devices.updateStatus', { id }, {}, { ...body });
    await this.writeAdminAuditLog(req, {
      action: 'device.status',
      resourceType: 'device',
      resourceId: id,
      before,
      after: {
        id,
        status: body.status,
        result,
      },
    });
    return result;
  }

  @Post('devices/:id/provision')
  @AdminPermission('device:provision')
  async provisionDevice(@Req() req: any, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const before = await this.loadDeviceSnapshot(req, id);
    const result = await this.device(req, 'admin.devices.provision', { id }, {}, body);
    await this.writeAdminAuditLog(req, {
      action: 'device.provision',
      resourceType: 'device',
      resourceId: id,
      before,
      after: sanitizeAuditObject(result, { id, ...body }),
    });
    return result;
  }

  @Post('devices/:id/unbind')
  @AdminPermission('device:unbind')
  async unbindDevice(@Req() req: any, @Param('id') id: string) {
    const before = await this.loadDeviceSnapshot(req, id);
    const result = await this.device(req, 'admin.devices.unbind', { id });
    await this.writeAdminAuditLog(req, {
      action: 'device.unbind',
      resourceType: 'device',
      resourceId: id,
      before,
      after: {
        id,
        unbound: true,
        result,
      },
    });
    return result;
  }

  @Get('devices/:id/commands')
  @AdminPermission('device:view')
  listDeviceCommands(@Req() req: any, @Param('id') id: string) {
    return this.device(req, 'admin.devices.commands.list', { id });
  }

  @Post('devices/:id/commands')
  @AdminPermission('device:update')
  async requestDeviceCommand(@Req() req: any, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const result = await this.device(req, 'admin.devices.command', { id }, {}, body);
    await this.writeAdminAuditLog(req, {
      action: 'device.command',
      resourceType: 'device_command',
      resourceId: id,
      after: sanitizeAuditObject(result, { id, ...body }),
    });
    return result;
  }

  @Get('devices/:id/ota/tasks')
  @AdminPermission('device:view')
  otaTasks(@Req() req: any, @Param('id') id: string) {
    return this.device(req, 'admin.devices.ota.tasks', { id });
  }

  @Post('devices/:id/ota/upgrade')
  @AdminPermission('device:update')
  async otaUpgrade(@Req() req: any, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const result = await this.device(req, 'admin.devices.ota.upgrade', { id }, {}, body);
    await this.writeAdminAuditLog(req, {
      action: 'device-ota.upgrade',
      resourceType: 'device_ota_task',
      resourceId: id,
      after: sanitizeAuditObject(result, { id, ...body }),
    });
    return result;
  }

  @Post('devices/:id/ota/cancel')
  @AdminPermission('device:update')
  async otaCancel(@Req() req: any, @Param('id') id: string) {
    const result = await this.device(req, 'admin.devices.ota.cancel', { id });
    await this.writeAdminAuditLog(req, {
      action: 'device-ota.cancel',
      resourceType: 'device_ota_task',
      resourceId: id,
      after: {
        id,
        cancelled: true,
        result,
      },
    });
    return result;
  }

  @Get('meals')
  @AdminPermission('meal:view')
  @ApiOperation({ summary: '查询餐食记录列表' })
  listMeals(@Req() req: any, @Query() query: AdminPageQueryDto) {
    return this.diet(req, 'meals', 'ListMeals', toListPayload(query), true);
  }

  @Get('meals/:id')
  @AdminPermission('meal:view')
  getMeal(@Req() req: any, @Param('id') id: string) {
    return this.diet(req, 'meals', 'GetMeal', { id });
  }

  @Get('meals/:id/items')
  @AdminPermission('meal:view')
  getMealItems(@Req() req: any, @Param('id') id: string) {
    return this.diet(req, 'meals', 'ListMealItems', { id }, true);
  }

  @Get('meal-items/:itemId')
  @AdminPermission('meal:view')
  @ApiOperation({ summary: '查询餐次条目详情（含识别快照）' })
  getMealItem(@Req() req: any, @Param('itemId') itemId: string) {
    return this.diet(req, 'meals', 'GetMealItem', { itemId });
  }

  @Get('foods')
  @AdminPermission('food:view')
  @ApiOperation({ summary: '查询食物库列表' })
  listFoods(@Req() req: any, @Query() query: AdminPageQueryDto) {
    return this.diet(req, 'foods', 'ListFoods', toListPayload(query), true);
  }

  @Get('foods/:id')
  @AdminPermission('food:view')
  getFood(@Req() req: any, @Param('id') id: string) {
    return this.diet(req, 'foods', 'GetFood', { id });
  }

  @Get('user-common-foods')
  @AdminPermission('food:view')
  @ApiOperation({ summary: '查询用户沉淀食物数据' })
  listUserCommonFoods(@Req() req: any, @Query() query: AdminPageQueryDto) {
    return this.diet(req, 'foods', 'ListUserCommonFoods', toListPayload(query), true);
  }

  @Post('foods')
  @AdminPermission('food:create')
  async createFood(@Req() req: any, @Body() body: Record<string, unknown>) {
    const result = await this.diet(req, 'foods', 'CreateFood', { body_json: JSON.stringify(body ?? {}) });
    const resultPayload = asRecord(result);
    await this.writeAdminAuditLog(req, {
      action: 'food.create',
      resourceType: 'food',
      resourceId: pickString(resultPayload.id),
      after: sanitizeAuditObject(result, body),
    });
    return result;
  }

  @Patch('foods/:id')
  @AdminPermission('food:update')
  async updateFood(@Req() req: any, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const before = await this.loadFoodSnapshot(req, id);
    const result = await this.diet(req, 'foods', 'UpdateFood', { id, body_json: JSON.stringify(body ?? {}) });
    await this.writeAdminAuditLog(req, {
      action: 'food.update',
      resourceType: 'food',
      resourceId: id,
      before,
      after: sanitizeAuditObject(result, { id, ...body }),
    });
    return result;
  }

  @Patch('foods/:id/status')
  @AdminPermission('food:update')
  async updateFoodStatus(@Req() req: any, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const before = await this.loadFoodSnapshot(req, id);
    const result = await this.diet(req, 'foods', 'UpdateFoodStatus', { id, body_json: JSON.stringify(body ?? {}) });
    await this.writeAdminAuditLog(req, {
      action: 'food.status',
      resourceType: 'food',
      resourceId: id,
      before,
      after: sanitizeAuditObject(result, { id, ...body }),
    });
    return result;
  }

  @Get('recognition-logs')
  @AdminPermission('recognition-log:view')
  @ApiOperation({ summary: '查询识别日志列表' })
  recognitionLogs(@Req() req: any, @Query() query: AdminPageQueryDto) {
    return this.diet(req, 'recognitionLogs', 'ListRecognitionLogs', toListPayload(query), true);
  }

  @Get('recognition-logs/:id')
  @AdminPermission('recognition-log:view')
  recognitionLog(@Req() req: any, @Param('id') id: string) {
    return this.diet(req, 'recognitionLogs', 'GetRecognitionLog', { id });
  }

  @Get('iot/messages')
  @AdminPermission('iot-message:view')
  @ApiOperation({ summary: '查询 IoT 消息列表' })
  iotMessages(@Req() req: any, @Query() query: AdminPageQueryDto) {
    return this.iot(req, 'ListIotMessages', toListPayload(query), true);
  }

  @Get('iot/messages/:id')
  @AdminPermission('iot-message:view')
  iotMessage(@Req() req: any, @Param('id') id: string) {
    return this.iot(req, 'GetIotMessage', { id });
  }

  private async user(
    req: any,
    operation: string,
    params: Record<string, unknown> = {},
    query: Record<string, unknown> = {},
    body: Record<string, unknown> = {},
    paged = false,
  ) {
    const result = await this.grpcInvoker.invoke({
      service: 'base-service',
      operation,
      requestId: req.requestId,
      call: () => this.baseUserGrpcAdapter.execute({
        operation,
        params,
        query,
        body,
        user: req.user as AuthenticatedUser,
        requestId: req.requestId,
      }),
    });
    return paged ? normalizeAdminPaged(result) : result;
  }

  private async device(
    req: any,
    operation: string,
    params: Record<string, unknown> = {},
    query: Record<string, unknown> = {},
    body: Record<string, unknown> = {},
    paged = false,
  ) {
    const result = await this.grpcInvoker.invoke({
      service: 'biz-service',
      operation,
      requestId: req.requestId,
      call: () => this.bizDeviceGrpcAdapter.execute({
        operation,
        params,
        query,
        body,
        user: req.user as AuthenticatedUser,
        requestId: req.requestId,
      }),
    });
    return paged ? normalizeAdminPaged(result) : result;
  }

  private async diet<T = unknown>(
    req: any,
    service: 'meals' | 'foods' | 'recognitionLogs',
    method: string,
    payload: Record<string, unknown>,
    paged = false,
  ): Promise<T> {
    const result = await this.grpcInvoker.invoke({
      service: 'biz-service',
      operation: `admin.${service}.${method}`,
      requestId: req.requestId,
      call: () =>
        paged
          ? this.bizDietAdminGrpcAdapter.callList(service, method, payload, req.requestId)
          : this.bizDietAdminGrpcAdapter.callOne(service, method, payload, req.requestId),
    });
    return result as T;
  }

  private async iot<T = unknown>(
    req: any,
    method: string,
    payload: Record<string, unknown>,
    paged = false,
  ): Promise<T> {
    const result = await this.grpcInvoker.invoke({
      service: 'biz-service',
      operation: `admin.iotMessages.${method}`,
      requestId: req.requestId,
      call: () =>
        paged
          ? this.bizIotAdminGrpcAdapter.callList(method, payload, req.requestId)
          : this.bizIotAdminGrpcAdapter.callOne(method, payload, req.requestId),
    });
    return result as T;
  }

  private async loadUserSnapshot(req: any, id: string) {
    return this.safeAuditSnapshot(() => this.user(req, 'admin.users.get', { id }));
  }

  private async loadDeviceSnapshot(req: any, id: string) {
    return this.safeAuditSnapshot(() => this.device(req, 'admin.devices.get', { id }));
  }

  private async loadFoodSnapshot(req: any, id: string) {
    return this.safeAuditSnapshot(() => this.diet(req, 'foods', 'GetFood', { id }));
  }

  private async safeAuditSnapshot(
    factory: () => Promise<unknown>,
  ): Promise<Record<string, unknown> | undefined> {
    try {
      return asRecord(await factory());
    } catch (error) {
      this.logger.warn(
        `failed to load audit snapshot: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return undefined;
    }
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

function toListPayload(query: AdminPageQueryDto) {
  return {
    page: query.page,
    pageSize: query.pageSize,
    keyword: query.keyword ?? '',
  };
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
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

function sanitizeAuditObject(...values: unknown[]): Record<string, unknown> {
  for (const value of values) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return {};
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
