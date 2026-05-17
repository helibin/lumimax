import { Body, Controller, Headers, HttpCode, HttpStatus, Inject, Param, Post, Req } from '@nestjs/common';
import { RawResponse } from '@lumimax/http-kit';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BizIotBridgeGrpcAdapter } from '../../grpc/biz-service.grpc-client';
import { GrpcInvokerService } from '../grpc-invoker.service';
import { assertGatewayIotHttpUplinkIngestAllowed } from './gateway-iot-uplink-guard';
import { normalizeIotWebhookBody } from './gateway-iot-webhook.util';
import { InternalMqttAuthService } from './internal-mqtt-auth.service';

@ApiTags('internal-iot')
@Controller(['internal/iot', 'api/internal/iot'])
@RawResponse()
export class InternalIotController {
  constructor(
    @Inject(GrpcInvokerService) private readonly grpcInvoker: GrpcInvokerService,
    @Inject(BizIotBridgeGrpcAdapter) private readonly bizIotBridgeGrpcAdapter: BizIotBridgeGrpcAdapter,
    @Inject(InternalMqttAuthService)
    private readonly internalMqttAuthService: InternalMqttAuthService,
  ) {}

  @Post('auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'EMQX MQTT auth bridge' })
  authenticate(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    console.log(1111, '1,,,')
    this.internalMqttAuthService.authorize(headers);
    return this.grpcInvoker.invoke({
      service: 'biz-service',
      operation: 'Authenticate',
      requestId: req.requestId,
      call: () =>
        this.bizIotBridgeGrpcAdapter.authenticate({
          body,
          requestId: req.requestId,
        }),
    });
  }

  @Post('acl')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'EMQX MQTT ACL bridge' })
  authorize(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    this.internalMqttAuthService.authorize(headers);
    return this.grpcInvoker.invoke({
      service: 'biz-service',
      operation: 'Authorize',
      requestId: req.requestId,
      call: () =>
        this.bizIotBridgeGrpcAdapter.authorize({
          body,
          requestId: req.requestId,
        }),
    });
  }

  @Post('ingest/:vendor')
  @ApiOperation({
    summary: '转发 IoT 调试消息到 biz-service IoT gRPC IngestCloudMessage，实际云厂商由服务端 IOT_VENDOR 决定',
    description:
      '与 webhook/:vendor 相同：接受各厂商原始 webhook 体（如 EMQX message.publish 中 payload 为 JSON 字符串），由 iot-kit 归一化后再转发。',
  })
  @ApiBody({ description: 'IoT vendor raw webhook / ingest body', schema: { type: 'object', additionalProperties: true } })
  async ingest(
    @Param('vendor') vendor: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    assertGatewayIotHttpUplinkIngestAllowed();
    const normalized = normalizeIotWebhookBody(vendor, body);
    return this.grpcInvoker.invoke({
      service: 'biz-service',
      operation: 'IngestCloudMessage',
      requestId: req.requestId,
      call: () =>
        this.bizIotBridgeGrpcAdapter.ingestCloudMessage({
          topic: normalized.topic,
          payload: normalized.payload,
          receivedAt: normalized.receivedAt,
          requestId: req.requestId,
        }),
    });
  }

  @Post('webhook/:vendor')
  @ApiOperation({ summary: 'IoT webhook 调试入口，等价转发到 IngestCloudMessage，实际云厂商由服务端 IOT_VENDOR 决定' })
  @ApiBody({ description: 'IoT webhook payload', schema: { type: 'object', additionalProperties: true } })
  webhook(
    @Param('vendor') vendor: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    assertGatewayIotHttpUplinkIngestAllowed();
    const normalized = normalizeIotWebhookBody(vendor, body);
    return this.grpcInvoker.invoke({
      service: 'biz-service',
      operation: 'IngestCloudMessage',
      requestId: req.requestId,
      call: () =>
        this.bizIotBridgeGrpcAdapter.ingestCloudMessage({
          topic: normalized.topic,
          payload: normalized.payload,
          receivedAt: normalized.receivedAt,
          requestId: req.requestId,
        }),
    });
  }
}
