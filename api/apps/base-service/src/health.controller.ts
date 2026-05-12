import { Controller, Get, Inject } from '@nestjs/common';
import { HealthService } from '@lumimax/health';

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get()
  async check() {
    return this.healthService.check();
  }
}
