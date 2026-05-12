import { Controller, Get, Inject } from '@nestjs/common';
import { HealthService } from '@lumimax/health';
import { ThirdPartyAvailabilityService } from './startup/third-party-availability.service';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(HealthService) private readonly healthService: HealthService,
    @Inject(ThirdPartyAvailabilityService)
    private readonly thirdPartyAvailabilityService: ThirdPartyAvailabilityService,
  ) {}

  @Get()
  async check() {
    const health = await this.healthService.check();
    return {
      ...health,
      thirdParty: this.thirdPartyAvailabilityService.getReport(),
    };
  }
}
