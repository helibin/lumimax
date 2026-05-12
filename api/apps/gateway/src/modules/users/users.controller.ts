import { Body, Controller, Get, Inject, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../guards/auth.guard';
import { BaseUserGrpcAdapter } from '../../grpc/base-service.grpc-client';
import { GrpcInvokerService } from '../grpc-invoker.service';
import { requireUser, resolveTenantScope } from '../../controllers/controller-context.util';

@ApiTags('用户接口')
@ApiBearerAuth('bearer')
@UseGuards(AuthGuard)
@Controller('api/users')
export class UsersController {
  constructor(
    @Inject(GrpcInvokerService) private readonly grpcInvoker: GrpcInvokerService,
    @Inject(BaseUserGrpcAdapter) private readonly baseUserGrpcAdapter: BaseUserGrpcAdapter,
  ) {}

  @Get('me')
  @ApiOperation({ summary: '获取当前用户信息', description: '返回当前登录用户的资料信息。' })
  me(@Req() req: any) {
    const user = requireUser(req);
    const tenantScope = resolveTenantScope(req, user);
    return this.grpcInvoker.invoke({
      service: 'base-service',
      operation: 'identity.me',
      requestId: req.requestId,
      call: () =>
        this.baseUserGrpcAdapter.execute({
          operation: 'identity.me',
          user,
          tenantScope,
          requestId: req.requestId,
        }),
    });
  }

  @Patch('me')
  @ApiOperation({ summary: '更新当前用户信息', description: '更新当前登录用户的基础资料。' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        username: { type: 'string', example: 'demo_user_2' },
      },
    },
  })
  updateMe(@Req() req: any, @Body() body: Record<string, unknown>) {
    const user = requireUser(req);
    const tenantScope = resolveTenantScope(req, user);
    return this.grpcInvoker.invoke({
      service: 'base-service',
      operation: 'identity.update',
      requestId: req.requestId,
      call: () =>
        this.baseUserGrpcAdapter.execute({
          operation: 'identity.update',
          body,
          user,
          tenantScope,
          requestId: req.requestId,
        }),
    });
  }
}
