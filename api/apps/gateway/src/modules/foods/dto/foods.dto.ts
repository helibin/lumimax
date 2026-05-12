import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { DIET_MARKET_VALUES } from '../../diet-market.constants';

const LOCALE_REGEX = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;

export class SuggestFoodsQueryDto {
  @ApiProperty({ example: 'rice' })
  @IsString()
  @MaxLength(128)
  q!: string;

  @ApiProperty({ required: false, example: 5, default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ example: 'zh-CN', description: '推荐使用，表示语言与地区偏好，如 zh-CN / en-US' })
  @IsOptional()
  @IsString()
  @Matches(LOCALE_REGEX, { message: 'locale must be like zh-CN or en' })
  locale?: string;

  @ApiPropertyOptional({ example: 'CN', enum: DIET_MARKET_VALUES, description: '业务市场路由，通常由设备属性决定' })
  @IsOptional()
  @IsString()
  @IsIn(DIET_MARKET_VALUES, {
    message: `market must be one of ${DIET_MARKET_VALUES.join(', ')}`,
  })
  market?: string;
}
