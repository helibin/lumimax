import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ApiSuccessResponseDto } from '@lumimax/http-kit';
import {
  EnvService,
  getEnvString,
  type AppConfigValues,
} from '@lumimax/config';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ServiceSummaryDto } from '../../dto/gateway.dto';

void EnvService;

@ApiTags('系统接口')
@Controller('api/system')
export class SystemController {
  private readonly envService: EnvService;

  constructor(envService: EnvService) {
    this.envService = envService;
  }

  @Get('services')
  @ApiOperation({ summary: '开发环境服务路由摘要', description: '仅开发环境可用，返回当前平台内部服务与文档入口摘要。' })
  @ApiOkResponse({ type: ApiSuccessResponseDto })
  getServices() {
    const appConfig: AppConfigValues = this.envService.getAppConfig();
    if (!appConfig.isDevelopment) {
      throw new NotFoundException();
    }

    const services: ServiceSummaryDto[] = [
      { name: 'gateway', type: 'http', health: '/health', docs: '/api/docs' },
      {
        name: 'base-service',
        type: 'hybrid',
        health: `grpc://${getEnvString('BASE_SERVICE_GRPC_ENDPOINT', '127.0.0.1:4120')}`,
      },
      {
        name: 'biz-service',
        type: 'hybrid',
        health: `grpc://${getEnvString('BIZ_SERVICE_GRPC_ENDPOINT', '127.0.0.1:4130')}`,
      },
    ];

    return { services };
  }
}
