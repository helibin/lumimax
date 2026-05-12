import { Controller, Get } from '@nestjs/common';
import { ApiSuccessResponseDto } from '@lumimax/http-kit';
import { HealthService } from '@lumimax/health';
import type { HealthResponse } from '@lumimax/contracts';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

void HealthService;

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly healthService: HealthService;

  constructor(healthService: HealthService) {
    this.healthService = healthService;
  }

  @Get()
  @ApiOperation({ summary: 'Gateway 健康检查' })
  @ApiOkResponse({ type: ApiSuccessResponseDto })
  async check(): Promise<HealthResponse> {
    return this.healthService.check();
  }
}
