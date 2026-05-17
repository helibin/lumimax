import { Controller, Inject } from '@nestjs/common';
import { resolveConfiguredIotVendor, shouldRejectEmqxHttpStyleUplinkIngest } from '@lumimax/config';
import { createIotEmqxQueueHttpIngestDisabledException } from '@lumimax/contracts';
import { AppLogger } from '@lumimax/logger';
import {
  parseGrpcJson,
  resolveGrpcRequestId,
} from '@lumimax/integration/grpc/gateway-grpc.util';
import { GrpcMethod } from '@nestjs/microservices';
import { EmqxIngressService } from '../ingress/emqx-ingress.service';
import { IotApplicationService } from '../provisioning/iot-application.service';

@Controller()
export class IotFacadeGrpcController {
  constructor(
    @Inject(IotApplicationService)
    private readonly iotApplicationService: IotApplicationService,
    @Inject(EmqxIngressService)
    private readonly emqxIngressService: EmqxIngressService,
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
    if (shouldRejectEmqxHttpStyleUplinkIngest()) {
      throw createIotEmqxQueueHttpIngestDisabledException();
    }
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
    const result = await this.iotApplicationService.ingestCloudMessage({
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

  @GrpcMethod('BizIotFacadeService', 'Authenticate')
  async authenticate(
    payload: {
      request_id?: string;
      body_json?: string;
    },
    metadata?: unknown,
  ) {
    const data = await this.emqxIngressService.authenticate(
      parseGrpcJson<Record<string, unknown>>(payload.body_json, {}),
    );
    return {
      json: JSON.stringify({
        ...data,
        requestId: data.requestId ?? resolveGrpcRequestId(payload.request_id, metadata),
      }),
    };
  }

  @GrpcMethod('BizIotFacadeService', 'Authorize')
  async authorize(
    payload: {
      request_id?: string;
      body_json?: string;
    },
    metadata?: unknown,
  ) {
    const data = await this.emqxIngressService.authorize(
      parseGrpcJson<Record<string, unknown>>(payload.body_json, {}),
    );
    return {
      json: JSON.stringify({
        ...data,
        requestId: data.requestId ?? resolveGrpcRequestId(payload.request_id, metadata),
      }),
    };
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
    const requestId = resolveGrpcRequestId(payload.request_id, metadata);
    const result = await this.iotApplicationService.callAdminMessage({
      method: payload.method ?? '',
      payload: JSON.parse(payload.payload_json || '{}') as Record<string, unknown>,
      requestId,
    });
    return { json: JSON.stringify(result) };
  }
}
