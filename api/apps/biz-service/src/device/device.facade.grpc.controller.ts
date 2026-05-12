/*
 * @Author: Lybeen
 * @Email: helibin@139.com
 * @Date: 2026-04-30 16:55:25
 * @LastEditTime: 2026-05-01 22:58:30
 * @LastEditors: Lybeen
 * @FilePath: /@ai/lumimax/api/apps/biz-service/src/device/device.facade.grpc.controller.ts
 */
import { Controller, Inject, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '@lumimax/auth';
import {
  stringifyGrpcJson,
} from '@lumimax/integration/grpc/gateway-grpc.util';
import {
  parseGrpcFacadeExecutePayload,
} from '@lumimax/integration/grpc/facade-execute.util';
import type { GatewayGrpcReply } from '@lumimax/integration/grpc/gateway-grpc.util';
import { GrpcMethod } from '@nestjs/microservices';
import { DeviceFacade } from './device.facade';

@Controller()
export class DeviceFacadeGrpcController {
  private readonly logger = new Logger(DeviceFacadeGrpcController.name);

  constructor(@Inject(DeviceFacade) private readonly deviceFacade: DeviceFacade) {}

  @GrpcMethod('BizDeviceFacadeService', 'Execute')
  async execute(
    payload: Parameters<typeof parseGrpcFacadeExecutePayload<AuthenticatedUser | null>>[0],
    metadata?: unknown,
  ) {
    const input = parseGrpcFacadeExecutePayload<AuthenticatedUser | null>(payload, metadata);
    try {
      const data = await this.deviceFacade.execute(input);
      return toGatewaySuccess(data, input.requestId);
    } catch (error) {
      return toGatewayError(error, input.requestId);
    }
  }
}

function toGatewaySuccess(data: unknown, requestId: string): GatewayGrpcReply {
  const dataJson = stringifyGrpcJson(data);
  return {
    success: true,
    message: 'ok',
    data_json: dataJson,
    dataJson,
    request_id: requestId,
    requestId,
    http_status: 200,
    httpStatus: 200,
    business_code: 0,
    businessCode: 0,
    details_json: '',
    detailsJson: '',
  };
}

function toGatewayError(error: unknown, requestId: string): GatewayGrpcReply {
  const message = error instanceof Error ? error.message : 'Internal server error';
  return {
    success: false,
    message,
    data_json: 'null',
    dataJson: 'null',
    request_id: requestId,
    requestId,
    http_status: 500,
    httpStatus: 500,
    business_code: 0,
    businessCode: 0,
    details_json: '',
    detailsJson: '',
  };
}
