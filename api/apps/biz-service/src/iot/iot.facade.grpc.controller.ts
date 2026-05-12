import { Controller, Inject } from '@nestjs/common';
import { resolveConfiguredIotVendor } from '@lumimax/config';
import { AppLogger } from '@lumimax/logger';
import {
  parseGrpcJson,
  resolveGrpcRequestId,
} from '@lumimax/integration/grpc/gateway-grpc.util';
import { GrpcMethod } from '@nestjs/microservices';
import { IotFacade } from './iot.facade';

@Controller()
export class IotFacadeGrpcController {
  constructor(
    @Inject(IotFacade) private readonly iotFacade: IotFacade,
    @Inject(AppLogger) private readonly logger: AppLogger,
  ) {}

  @GrpcMethod('BizIotFacadeService', 'IngestCloudMessage')
  async ingestCloudMessage(
    payload: {
      request_id?: string;
      vendor?: string;
      topic?: string;
      payload_json?: string;
      received_at?: number;
    },
    metadata?: unknown,
  ) {
    const vendor = resolveConfiguredIotVendor();
    const requestId = resolveGrpcRequestId(payload.request_id, metadata);
    this.logger.debug(
      '<<< 收到 IoT gRPC 入站请求',
      {
        requestId,
        idLabel: 'ReqId',
        topic: payload.topic ?? '',
        receivedAt: Number(payload.received_at ?? Date.now()),
      },
      IotFacadeGrpcController.name,
    );
    const result = await this.iotFacade.ingestCloudMessage({
      vendor,
      topic: payload.topic ?? '',
      payloadJson: payload.payload_json ?? '{}',
      receivedAt: Number(payload.received_at ?? Date.now()),
      requestId,
    });
    this.logger.debug(
      'IoT gRPC 请求处理完成',
      {
        requestId,
        idLabel: 'ReqId',
        topic: payload.topic ?? '',
      },
      IotFacadeGrpcController.name,
    );
    return result;
  }

  @GrpcMethod('BizIotFacadeService', 'CallAdminMessage')
  async callAdminMessage(
    payload: {
      request_id?: string;
      method?: string;
      payload_json?: string;
    },
    metadata?: unknown,
  ) {
    const data = await this.iotFacade.callAdminMessage({
      method: payload.method ?? '',
      payload: parseGrpcJson<Record<string, unknown>>(payload.payload_json, {}),
      requestId: resolveGrpcRequestId(payload.request_id, metadata),
    });
    return {
      json: JSON.stringify(data ?? {}),
    };
  }
}
