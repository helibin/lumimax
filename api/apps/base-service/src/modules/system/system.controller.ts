import { Controller, Get, Inject } from '@nestjs/common';
import { SystemService } from './system.service';

@Controller()
export class SystemController {
  constructor(@Inject(SystemService) private readonly systemService: SystemService) {}

  @Get('internal/system/modules')
  getModuleSummary() {
    return {
      service: 'base-service',
      modules: this.systemService.getModuleStatuses(),
    };
  }
}
