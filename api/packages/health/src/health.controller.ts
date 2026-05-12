import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

void HealthService;

@Controller('health')
export class HealthController {
  private readonly healthService: HealthService;

  constructor(healthService: HealthService) {
    this.healthService = healthService;
  }

  @Get()
  check() {
    return this.healthService.check();
  }
}
