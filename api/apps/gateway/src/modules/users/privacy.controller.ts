import { Body, Controller, Get, Inject, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../../guards/auth.guard';
import { BaseUserGrpcAdapter } from '../../grpc/base-service.grpc-client';
import { requireUser, resolveTenantScope } from '../../controllers/controller-context.util';
import { GrpcInvokerService } from '../grpc-invoker.service';

void GrpcInvokerService;

@ApiTags('api-privacy')
@ApiBearerAuth('bearer')
@UseGuards(AuthGuard)
@Controller('api/privacy')
export class PrivacyController {
  constructor(
    @Inject(GrpcInvokerService) private readonly grpcInvoker: GrpcInvokerService,
    @Inject(BaseUserGrpcAdapter) private readonly baseUserGrpcAdapter: BaseUserGrpcAdapter,
  ) {}

  @Post('requests/export')
  @ApiOperation({ summary: '发起导出请求', description: '发起个人数据导出（Data Export）请求。' })
  createExport(@Req() req: any) {
    return this.invoke(req, 'privacy.requests.export');
  }

  @Post('requests/delete')
  @ApiOperation({ summary: '发起删除请求', description: '发起个人数据删除（Right to be forgotten）请求。' })
  createDelete(@Req() req: any) {
    return this.invoke(req, 'privacy.requests.delete');
  }

  @Post('requests/revoke-consent')
  @ApiOperation({ summary: '撤回同意', description: '发起撤回同意（revoke consent）请求。' })
  createRevokeConsent(@Req() req: any) {
    return this.invoke(req, 'privacy.requests.revokeConsent');
  }

  @Get('requests')
  @ApiOperation({ summary: '隐私请求列表', description: '查询隐私相关请求列表（导出/删除/撤回同意等）。' })
  @ApiQuery({ name: 'page', required: false, description: '页码（从 1 开始）', example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页数量', example: 20 })
  @ApiQuery({ name: 'status', required: false, description: '请求状态（由 base-service 定义）', example: 'pending' })
  @ApiQuery({ name: 'type', required: false, description: '请求类型（export/delete/revoke-consent 等，由 base-service 定义）', example: 'export' })
  listRequests(@Req() req: any, @Query() query: Record<string, unknown>) {
    return this.invoke(req, 'privacy.requests.list', {}, query);
  }

  @Post('requests')
  @ApiOperation({ summary: '创建隐私请求', description: '创建一条隐私请求（通用入口，具体字段由 base-service 校验）。' })
  @ApiBody({
    description: '隐私请求参数',
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: '请求类型', example: 'export' },
        reason: { type: 'string', description: '可选原因说明', example: '用户申请导出个人数据' },
        metadata: { type: 'object', additionalProperties: true, example: { lang: 'zh-CN' } },
      },
    },
  })
  createRequest(@Req() req: any, @Body() body: Record<string, unknown>, @Query() query: Record<string, unknown>) {
    return this.invoke(req, 'privacy.requests.create', {}, query, body);
  }

  @Post('consents')
  @ApiOperation({ summary: '提交同意记录', description: '提交/更新用户的隐私同意记录（consent）。' })
  @ApiBody({
    description: '同意记录参数',
    schema: {
      type: 'object',
      required: ['consentCode', 'granted'],
      properties: {
        consentCode: { type: 'string', example: 'marketing_email' },
        granted: { type: 'boolean', example: true },
        grantedAt: { type: 'string', description: 'ISO 时间字符串（可选）', example: '2026-04-24T12:34:56.000Z' },
        metadata: { type: 'object', additionalProperties: true, example: { source: 'settings' } },
      },
    },
  })
  createConsent(@Req() req: any, @Body() body: Record<string, unknown>, @Query() query: Record<string, unknown>) {
    return this.invoke(req, 'privacy.consents.create', {}, query, body);
  }

  private invoke(
    req: any,
    operation: string,
    params: Record<string, unknown> = {},
    query: Record<string, unknown> = {},
    body: Record<string, unknown> = {},
  ) {
    const user = requireUser(req);
    const tenantScope = resolveTenantScope(req, user);
    return this.grpcInvoker.invoke({
      service: 'base-service',
      operation,
      requestId: req.requestId,
      call: () => this.baseUserGrpcAdapter.execute({
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
}
