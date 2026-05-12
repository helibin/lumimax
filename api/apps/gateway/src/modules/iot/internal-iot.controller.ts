import { Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsObject, IsOptional, IsString } from 'class-validator';
import { BizIotBridgeGrpcAdapter } from '../../grpc/biz-service.grpc-client';
import { GrpcInvokerService } from '../grpc-invoker.service';

class InternalIotIngestDto {
  @IsString()
  topic!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  receivedAt?: number;
}

@ApiTags('internal-iot')
@Controller('internal/iot')
export class InternalIotController {
  constructor(
    @Inject(GrpcInvokerService) private readonly grpcInvoker: GrpcInvokerService,
    @Inject(BizIotBridgeGrpcAdapter) private readonly bizIotBridgeGrpcAdapter: BizIotBridgeGrpcAdapter,
  ) {}

  @Post('ingest/:vendor')
  @ApiOperation({ summary: '转发 IoT 调试消息到 biz-service IoT gRPC IngestCloudMessage，实际云厂商由服务端 IOT_VENDOR 决定' })
  @ApiBody({ description: 'IoT ingest payload', type: InternalIotIngestDto })
  async ingest(
    @Param('vendor') _vendor: string,
    @Body() body: InternalIotIngestDto,
    @Req() req: any,
  ) {
    return this.grpcInvoker.invoke({
      service: 'biz-service',
      operation: 'IngestCloudMessage',
      requestId: req.requestId,
      call: () =>
        this.bizIotBridgeGrpcAdapter.ingestCloudMessage({
          topic: body.topic,
          payload: body.payload,
          receivedAt: body.receivedAt,
          requestId: req.requestId,
        }),
    });
  }

  @Post('webhook/:vendor')
  @ApiOperation({ summary: 'IoT webhook 调试入口，等价转发到 IngestCloudMessage，实际云厂商由服务端 IOT_VENDOR 决定' })
  @ApiBody({ description: 'IoT webhook payload', type: InternalIotIngestDto })
  webhook(
    @Param('vendor') _vendor: string,
    @Body() body: InternalIotIngestDto,
    @Req() req: any,
  ) {
    return this.ingest(_vendor, body, req);
  }
}
