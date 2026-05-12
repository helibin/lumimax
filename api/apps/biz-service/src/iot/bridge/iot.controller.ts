import { Body, Controller, Headers, Inject, Post } from '@nestjs/common';
import { EmqxIngressService } from './emqx-ingress.service';
import { InternalMqttAuthService } from './internal-mqtt-auth.service';

@Controller('api/internal/iot')
export class IotController {
  constructor(
    @Inject(InternalMqttAuthService)
    private readonly internalMqttAuthService: InternalMqttAuthService,
    @Inject(EmqxIngressService)
    private readonly emqxIngressService: EmqxIngressService,
  ) {}

  @Post('auth')
  authenticate(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: Record<string, unknown>,
  ) {
    this.internalMqttAuthService.authorize(headers);
    return this.emqxIngressService.authenticate(body);
  }

  @Post('acl')
  authorize(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: Record<string, unknown>,
  ) {
    this.internalMqttAuthService.authorize(headers);
    return this.emqxIngressService.authorize(body);
  }

  @Post('ingest')
  ingest(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: Record<string, unknown>,
  ) {
    this.internalMqttAuthService.authorize(headers);
    return this.emqxIngressService.ingest(body);
  }

  @Post('webhook')
  webhook(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: Record<string, unknown>,
  ) {
    this.internalMqttAuthService.authorize(headers);
    return this.emqxIngressService.webhook(body);
  }
}
