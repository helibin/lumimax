import { Controller, Get, Inject } from '@nestjs/common';
import { HealthService } from '@lumimax/health';

@Controller('health')
export class IotHealthController {
  constructor(
    @Inject(HealthService) private readonly healthService: HealthService,
  ) {}

  @Get()
  check() {
    return this.healthService.check();
  }
}
