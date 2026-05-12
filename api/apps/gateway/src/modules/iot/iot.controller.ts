import { Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsObject, IsOptional, IsString } from 'class-validator';
import { BizIotBridgeGrpcAdapter } from '../../grpc/biz-service.grpc-client';
import { GrpcInvokerService } from '../grpc-invoker.service';

class ApiIotIngestDto {
  @IsString()
  topic!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  receivedAt?: number;
}

@ApiTags('api-iot')
@Controller('api/iot')
export class IotController {
  constructor(
    @Inject(GrpcInvokerService) private readonly grpcInvoker: GrpcInvokerService,
    @Inject(BizIotBridgeGrpcAdapter) private readonly bizIotBridgeGrpcAdapter: BizIotBridgeGrpcAdapter,
  ) {}

  @Post('webhook/:vendor')
  @ApiOperation({ summary: 'IoT Webhook', description: '接收并通过 gRPC 转发 IoT 上行 webhook 事件，实际云厂商由服务端 IOT_VENDOR 决定。' })
  @ApiBody({
    description: 'IoT webhook payload',
    schema: {
      type: 'object',
      required: ['topic', 'payload'],
      properties: {
        topic: { type: 'string' },
        payload: { type: 'object', additionalProperties: true },
        receivedAt: { type: 'number' },
      },
    },
  })
  webhook(
    @Param('vendor') _vendor: string,
    @Req() req: any,
    @Body() body: ApiIotIngestDto,
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

  @Post('callback/:vendor')
  @ApiOperation({ summary: 'IoT callback', description: '兼容回调入口，等价转发到 webhook gRPC ingest，实际云厂商由服务端 IOT_VENDOR 决定。' })
  callback(
    @Param('vendor') _vendor: string,
    @Req() req: any,
    @Body() body: ApiIotIngestDto,
  ) {
    return this.webhook(_vendor, req, body);
  }
}
