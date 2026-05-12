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
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../guards/auth.guard';
import { BizDeviceGrpcAdapter } from '../../grpc/biz-service.grpc-client';
import { requireUser, resolveTenantScope } from '../../controllers/controller-context.util';
import { GrpcInvokerService } from '../grpc-invoker.service';

@ApiTags('设备接口')
@ApiBearerAuth('bearer')
@UseGuards(AuthGuard)
@Controller('api/devices')
export class DevicesController {
  private readonly logger = new Logger(DevicesController.name);

  constructor(
    @Inject(GrpcInvokerService) private readonly grpcInvoker: GrpcInvokerService,
    @Inject(BizDeviceGrpcAdapter) private readonly bizDeviceGrpcAdapter: BizDeviceGrpcAdapter,
  ) {}

  @Get()
  @ApiOperation({ summary: '查询当前用户设备列表', description: '返回当前登录用户可访问的设备列表。' })
  @ApiQuery({ name: 'page', required: false, example: 1, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, example: 20, description: '每页数量，最大 100' })
  @ApiQuery({ name: 'keyword', required: false, example: 'SN-001', description: '按设备 SN 或设备 ID 模糊搜索' })
  @ApiQuery({ name: 'status', required: false, example: 'active', description: '设备业务状态筛选' })
  @ApiQuery({ name: 'onlineStatus', required: false, example: 'online', description: '在线状态筛选' })
  @ApiQuery({ name: 'provider', required: false, example: 'emqx', description: '设备接入 provider 筛选（emqx/aws/aliyun）' })
  list(@Req() req: any, @Query() query: Record<string, unknown>) {
    return this.invoke(req, 'devices.list', {}, {}, query);
  }

  @Post()
  @ApiOperation({ summary: '创建设备', description: 'C 端设备创建入口。' })
  @ApiBody({
    description: '设备创建参数',
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', example: 'Smart Scale A1' },
        deviceType: {
          type: 'string',
          example: 'smart-scale',
          default: 'smart-scale',
          description: '可选，默认 smart-scale',
        },
        provider: {
          type: 'string',
          enum: ['emqx', 'aws', 'aliyun'],
          example: 'emqx',
          description: '兼容字段，服务端会忽略该值并使用 IOT_VENDOR',
        },
      },
    },
  })
  create(@Req() req: any, @Body() body: Record<string, unknown>) {
    return this.invoke(req, 'devices.create', {}, sanitizeDeviceCreateBody(body));
  }

  @Get(':id')
  @ApiOperation({ summary: '查询设备详情', description: '根据设备 ID 查询设备基础信息。' })
  @ApiParam({ name: 'id', description: '设备 ID', example: '01J10000000000000000000123' })
  getById(@Req() req: any, @Param('id') id: string) {
    return this.invoke(req, 'devices.get', { id });
  }

  @Post(':id/bind')
  @ApiOperation({ summary: '绑定设备', description: '将指定设备绑定到当前用户或指定用户。' })
  @ApiParam({ name: 'id', description: '设备 ID', example: '01J10000000000000000000123' })
  @ApiBody({
    description: '绑定参数',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', example: '01J10000000000000000000U01' },
      },
    },
  })
  bind(@Req() req: any, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.invoke(req, 'devices.bind', { id }, body);
  }

  @Post(':id/unbind')
  @ApiOperation({ summary: '解绑设备', description: '解除当前设备与用户之间的绑定关系。' })
  @ApiParam({ name: 'id', description: '设备 ID', example: '01J10000000000000000000123' })
  unbind(@Req() req: any, @Param('id') id: string) {
    return this.invoke(req, 'devices.unbind', { id });
  }

  @Post(':id/commands')
  @ApiOperation({ summary: '下发设备命令', description: '向设备下发业务命令，例如重启、校准等。' })
  @ApiParam({ name: 'id', description: '设备 ID', example: '01J10000000000000000000123' })
  @ApiBody({
    description: '命令参数',
    schema: {
      type: 'object',
      required: ['commandType', 'payload'],
      properties: {
        commandType: { type: 'string', example: 'reboot' },
        payload: { type: 'object', additionalProperties: true, example: { delaySeconds: 1 } },
      },
    },
  })
  command(@Req() req: any, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.invoke(req, 'devices.command', { id }, body);
  }

  @Get(':id/shadow')
  @ApiOperation({ summary: '查询设备影子', description: '读取设备当前 reported/desired shadow 数据。' })
  @ApiParam({ name: 'id', description: '设备 ID', example: '01J10000000000000000000123' })
  getShadow(@Req() req: any, @Param('id') id: string) {
    return this.invoke(req, 'devices.shadow.get', { id });
  }

  @Patch(':id/shadow/desired')
  @ApiOperation({ summary: '更新设备期望状态', description: '更新设备 desired shadow，并触发对应下行同步。' })
  @ApiParam({ name: 'id', description: '设备 ID', example: '01J10000000000000000000123' })
  @ApiBody({
    description: 'desired shadow 更新参数',
    schema: {
      type: 'object',
      required: ['desired'],
      properties: {
        desired: { type: 'object', additionalProperties: true, example: { mode: 'eco' } },
      },
    },
  })
  patchDesired(@Req() req: any, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.invoke(req, 'devices.shadow.patch', { id }, body);
  }

  private invoke(
    req: any,
    operation: string,
    params: Record<string, unknown>,
    body: Record<string, unknown> = {},
    query: Record<string, unknown> = {},
  ) {
    const user = requireUser(req);
    const tenantScope = resolveTenantScope(req, user);
    return this.grpcInvoker.invoke({
      service: 'biz-service',
      operation,
      requestId: req.requestId,
      call: async () => {
        const result = await this.bizDeviceGrpcAdapter.execute({
          operation,
          params,
          query,
          body,
          user,
          tenantScope,
          requestId: req.requestId,
        });
        if (operation === 'devices.list') {
          const target = asObject(result);
          const items = Array.isArray(target.items)
            ? target.items
            : Array.isArray(target.data)
              ? target.data
              : null;
          this.logger.log(
            `devices.list gateway result ${JSON.stringify({
              requestId: req.requestId,
              operation,
              itemCount: items?.length ?? null,
              keys: Object.keys(target),
              pagination: asObject(target.pagination),
              tenantScope,
              userId: user.userId,
            })}`,
          );
        }
        return result;
      },
    });
  }
}

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function sanitizeDeviceCreateBody(body: Record<string, unknown>): Record<string, unknown> {
  const next = { ...body };
  delete next.provider;
  delete next.vendor;
  return next;
}
