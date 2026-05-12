import { ApiProperty } from '@nestjs/swagger';

export class GatewayHealthDto {
  @ApiProperty({ example: 'ok' })
  status!: string;

  @ApiProperty({ example: 'gateway' })
  service!: string;
}

export class GatewayPassThroughDto {
  @ApiProperty({ example: 'api' })
  scope!: string;

  @ApiProperty({ example: '/api/devices' })
  path!: string;

  @ApiProperty({ example: 'GET' })
  method!: string;
}

export class ServiceSummaryDto {
  @ApiProperty({ example: 'base-service' })
  name!: string;

  @ApiProperty({ example: 'hybrid', enum: ['http', 'hybrid'] })
  type!: 'http' | 'hybrid';

  @ApiProperty({ example: 'http://base-service:4020/health' })
  health!: string;

  @ApiProperty({ example: 'http://base-service:4020/docs', required: false })
  docs?: string;
}

export class ServicesResponseDto {
  @ApiProperty({ type: ServiceSummaryDto, isArray: true })
  services!: ServiceSummaryDto[];
}
