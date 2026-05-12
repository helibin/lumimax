/*
 * @Author: Lybeen
 * @Email: helibin@139.com
 * @Date: 2026-04-21 02:27:30
 * @LastEditTime: 2026-04-21 04:15:42
 * @LastEditors: Lybeen
 * @FilePath: /@ai/lumimax/api/libs/common/src/response/api-response.dto.ts
 */
import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from './pagination.dto';

export class ApiErrorDto {
  @ApiProperty({ required: false, type: Object, additionalProperties: true })
  details?: unknown;
}

export class ApiSuccessResponseDto<T = unknown> {
  @ApiProperty({ example: 0 })
  code!: number;

  @ApiProperty({ example: 200, description: 'HTTP 状态码' })
  status!: number;

  @ApiProperty({ example: 'ok' })
  msg!: string;

  @ApiProperty({ type: Object, nullable: true, additionalProperties: true })
  data!: T;

  @ApiProperty({ example: 1713667200000 })
  timestamp!: number;

  @ApiProperty({ example: 'f3a8e95d-f3ac-4e48-9f7c-94d73b3f1b87' })
  requestId!: string;
}

export class ApiPagedResponseDto<T = unknown> {
  @ApiProperty({ example: 0 })
  code!: number;

  @ApiProperty({ example: 200, description: 'HTTP 状态码' })
  status!: number;

  @ApiProperty({ example: 'ok' })
  msg!: string;

  @ApiProperty({ type: [Object] })
  data!: T[];

  @ApiProperty({ type: PaginationMetaDto })
  pagination!: PaginationMetaDto;

  @ApiProperty({ example: 1713667200000 })
  timestamp!: number;

  @ApiProperty({ example: 'f3a8e95d-f3ac-4e48-9f7c-94d73b3f1b87' })
  requestId!: string;
}

export class ApiErrorResponseDto {
  @ApiProperty({ example: 40400 })
  code!: number;

  @ApiProperty({ example: 404, description: 'HTTP 状态码' })
  status!: number;

  @ApiProperty({ example: 'Not Found' })
  msg!: string;

  @ApiProperty({ example: null, nullable: true })
  data!: null;

  @ApiProperty({ example: 1713667200000 })
  timestamp!: number;

  @ApiProperty({ example: 'f3a8e95d-f3ac-4e48-9f7c-94d73b3f1b87' })
  requestId!: string;

  @ApiProperty({ type: ApiErrorDto, required: false })
  error?: ApiErrorDto;
}
