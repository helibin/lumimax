import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BaseSystemGrpcAdapter } from '../../grpc/base-service.grpc-client';
import { GrpcInvokerService } from '../grpc-invoker.service';

@ApiTags('字典接口')
@Controller('api/dict')
export class DictController {
  constructor(
    @Inject(GrpcInvokerService) private readonly grpcInvoker: GrpcInvokerService,
    @Inject(BaseSystemGrpcAdapter) private readonly baseSystemGrpcAdapter: BaseSystemGrpcAdapter,
  ) {}

  @Get(':dictType')
  @ApiOperation({ summary: '查询单个字典项列表', description: '按字典类型返回对应字典项集合。' })
  @ApiParam({ name: 'dictType', description: '字典类型', example: 'gender' })
  @ApiQuery({ name: 'status', required: false, description: '状态筛选', example: 'active' })
  getDictItems(
    @Req() req: any,
    @Param('dictType') dictType: string,
    @Query('status') status?: string,
  ) {
    return this.grpcInvoker.invoke({
      service: 'base-service',
      operation: 'dict.getItems',
      requestId: req.requestId,
      call: () =>
        this.baseSystemGrpcAdapter.getDictItems({
          dictType,
          status,
          requestId: req.requestId,
        }),
    });
  }

  @Get('batch/items')
  @ApiOperation({ summary: '批量查询字典项列表', description: '按多个字典类型批量返回字典项数据。' })
  @ApiQuery({
    name: 'types',
    required: true,
    description: '逗号分隔字典类型，例如 gender,user_type,device_status',
    example: 'gender,user_type,device_status',
  })
  @ApiQuery({ name: 'status', required: false, description: '状态筛选', example: 'active' })
  batchGetDictItems(
    @Req() req: any,
    @Query('types') types: string,
    @Query('status') status?: string,
  ) {
    const dictTypes = types
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    return this.grpcInvoker.invoke({
      service: 'base-service',
      operation: 'dict.batchGetItems',
      requestId: req.requestId,
      call: () =>
        this.baseSystemGrpcAdapter.batchGetDictItems({
          dictTypes,
          status,
          requestId: req.requestId,
        }),
    });
  }
}
