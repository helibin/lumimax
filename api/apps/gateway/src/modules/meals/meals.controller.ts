import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../guards/auth.guard';
import { BizDietGrpcAdapter } from '../../grpc/biz-service.grpc-client';
import { requireUser, resolveTenantScope } from '../../controllers/controller-context.util';
import { GrpcInvokerService } from '../grpc-invoker.service';
import {
  AnalyzeMealItemRequestDto,
  ConfirmMealItemRequestDto,
  CreateMealRequestDto,
  ListMealsQueryDto,
} from './dto/meals.dto';

void GrpcInvokerService;

@ApiTags('餐食接口')
@ApiBearerAuth('bearer')
@UseGuards(AuthGuard)
@Controller('api/meals')
export class MealsController {
  constructor(
    @Inject(GrpcInvokerService) private readonly grpcInvoker: GrpcInvokerService,
    @Inject(BizDietGrpcAdapter) private readonly bizDietGrpcAdapter: BizDietGrpcAdapter,
  ) {}

  @Post()
  @ApiOperation({ summary: '创建用餐记录', description: '创建一次新的 meal record，用于后续食物识别与营养分析。' })
  @ApiBody({ type: CreateMealRequestDto })
  create(@Req() req: any, @Body() body: CreateMealRequestDto) {
    return this.invoke(req, 'meals.create', {}, {}, toRecord(body));
  }

  @Get()
  @ApiOperation({ summary: '查询当前用户用餐记录列表', description: '按分页返回当前用户的 meal 列表。' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, example: 20 })
  list(@Req() req: any, @Query() query: ListMealsQueryDto) {
    return this.invoke(req, 'meals.list', {}, toRecord(query));
  }

  @Get(':id')
  @ApiOperation({ summary: '查询用餐记录详情', description: '根据 meal ID 查询完整的餐食记录信息。' })
  @ApiParam({ name: 'id', example: '01JMEAL00000000000000000001' })
  get(@Req() req: any, @Param('id') id: string) {
    return this.invoke(req, 'meals.get', { id });
  }

  @Post(':id/items/analyze')
  @ApiOperation({ summary: '分析单个食物图片', description: '提交图片对象键与重量，触发单个食物识别与营养估算。' })
  @ApiParam({ name: 'id', example: '01JMEAL00000000000000000001' })
  @ApiBody({ type: AnalyzeMealItemRequestDto })
  analyze(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: AnalyzeMealItemRequestDto,
  ) {
    return this.invoke(req, 'meals.items.analyze', { id }, {}, toRecord(body));
  }

  @Post(':id/items/:itemId/confirm')
  @ApiOperation({
    summary: '确认并修正单个食物',
    description: '确认候选食物名称与重量，并重新计算当前 item 与整餐营养。',
  })
  @ApiParam({ name: 'id', example: '01JMEAL00000000000000000001' })
  @ApiParam({ name: 'itemId', example: '01JITEM00000000000000000001' })
  @ApiBody({ type: ConfirmMealItemRequestDto })
  confirm(
    @Req() req: any,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: ConfirmMealItemRequestDto,
  ) {
    return this.invoke(req, 'meals.items.confirm', { id, itemId }, {}, toRecord(body));
  }

  @Post(':id/finish')
  @ApiOperation({ summary: '结束用餐分析流程', description: '结束当前 meal，并汇总整餐营养结果。' })
  @ApiParam({ name: 'id', example: '01JMEAL00000000000000000001' })
  finish(@Req() req: any, @Param('id') id: string) {
    return this.invoke(req, 'meals.finish', { id });
  }

  private invoke(
    req: any,
    operation: string,
    params: Record<string, unknown>,
    query: Record<string, unknown> = {},
    body: Record<string, unknown> = {},
  ) {
    const user = requireUser(req);
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
}

function toRecord<T extends object>(input: T): Record<string, unknown> {
  return input as unknown as Record<string, unknown>;
}
