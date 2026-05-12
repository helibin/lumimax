import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../guards/auth.guard';
import { BaseUserGrpcAdapter } from '../../grpc/base-service.grpc-client';
import { GrpcInvokerService } from '../grpc-invoker.service';
import { requireUser, resolveTenantScope } from '../../controllers/controller-context.util';

@ApiTags('身份接口')
@ApiBearerAuth('bearer')
@UseGuards(AuthGuard)
@Controller('api/identity')
export class IdentityController {
  constructor(
    @Inject(GrpcInvokerService) private readonly grpcInvoker: GrpcInvokerService,
    @Inject(BaseUserGrpcAdapter) private readonly baseUserGrpcAdapter: BaseUserGrpcAdapter,
  ) {}

  @Get('me')
  @ApiOperation({ summary: '当前登录用户信息', description: '返回当前登录用户的基础信息与租户上下文相关信息。' })
  getCurrent(@Req() req: any) {
    const user = requireUser(req);
    const tenantScope = resolveTenantScope(req, user);
    return this.grpcInvoker.invoke({
      service: 'base-service',
      operation: 'identity.me',
      requestId: req.requestId,
      call: () => this.baseUserGrpcAdapter.execute({
        operation: 'identity.me',
        user,
        tenantScope,
        requestId: req.requestId,
      }),
    });
  }
}
