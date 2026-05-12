import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../guards/auth.guard';
import { BizDietGrpcAdapter } from '../../grpc/biz-service.grpc-client';
import { requireUser, resolveTenantScope } from '../../controllers/controller-context.util';
import { DIET_MARKET_VALUES } from '../diet-market.constants';
import { GrpcInvokerService } from '../grpc-invoker.service';
import type { SuggestFoodsQueryDto } from './dto/foods.dto';

@ApiTags('食物接口')
@ApiBearerAuth('bearer')
@UseGuards(AuthGuard)
@Controller('api/foods')
export class FoodsController {
  constructor(
    @Inject(GrpcInvokerService) private readonly grpcInvoker: GrpcInvokerService,
    @Inject(BizDietGrpcAdapter) private readonly bizDietGrpcAdapter: BizDietGrpcAdapter,
  ) {}

  @Get('suggest')
  @ApiOperation({
    summary: '搜索食物候选',
    description: '根据关键词返回用户常吃与标准食品候选列表。',
  })
  @ApiQuery({ name: 'q', required: true, example: 'rice' })
  @ApiQuery({ name: 'limit', required: false, example: 5 })
  @ApiQuery({ name: 'locale', required: false, example: 'zh-CN', description: '推荐使用，表示语言与地区偏好' })
  @ApiQuery({ name: 'market', required: false, example: 'CN', enum: DIET_MARKET_VALUES, description: '业务市场路由，通常由设备属性决定' })
  suggest(@Req() req: any, @Query() query: SuggestFoodsQueryDto) {
    const user = requireUser(req);
    const tenantScope = resolveTenantScope(req, user);
    return this.grpcInvoker.invoke({
      service: 'biz-service',
      operation: 'foods.suggest',
      requestId: req.requestId,
      call: () =>
        this.bizDietGrpcAdapter.execute({
          operation: 'foods.suggest',
          query: toRecord(query),
          user,
          tenantScope,
          requestId: req.requestId,
        }),
    });
  }
}

function toRecord<T extends object>(input: T): Record<string, unknown> {
  return input as unknown as Record<string, unknown>;
}
