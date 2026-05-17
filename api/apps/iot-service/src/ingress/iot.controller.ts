import { Body, Controller, Headers, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { RawResponse } from '@lumimax/http-kit';
import { EmqxIngressService } from './emqx-ingress.service';
import { InternalMqttAuthService } from './internal-mqtt-auth.service';

@Controller('api/internal/iot')
@RawResponse()
export class IotController {
  constructor(
    @Inject(InternalMqttAuthService)
    private readonly internalMqttAuthService: InternalMqttAuthService,
    @Inject(EmqxIngressService)
    private readonly emqxIngressService: EmqxIngressService,
  ) {}

  @Post('auth')
  @HttpCode(HttpStatus.OK)
  authenticate(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: Record<string, unknown>,
  ) {
    this.internalMqttAuthService.authorize(headers);
    return this.emqxIngressService.authenticate(body);
  }

  @Post('acl')
  @HttpCode(HttpStatus.OK)
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
