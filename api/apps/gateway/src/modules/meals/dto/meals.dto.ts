import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsIn, Matches, MaxLength, Min } from 'class-validator';
import { DIET_MARKET_VALUES } from '../../diet-market.constants';

const LOCALE_REGEX = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;

export class CreateMealRequestDto {
  @ApiPropertyOptional({ example: '01JDEVICE000000000000000001' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceId?: string;
}

export class ListMealsQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pageSize?: number;
}

export class AnalyzeMealItemRequestDto {
  @ApiProperty({ example: 'tmp-file/user/01JUSER/meal.png' })
  @IsString()
  @MaxLength(512)
  imageKey!: string;

  @ApiPropertyOptional({ example: '01JOBJECT000000000000000001' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  imageObjectId?: string;

  @ApiProperty({ example: 128.5 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  weightGram!: number;

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

  @ApiPropertyOptional({ example: '01JDEVICE000000000000000001' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceId?: string;
}

export class ConfirmMealItemRequestDto {
  @ApiPropertyOptional({ example: 'steamed white rice' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  foodName?: string;

  @ApiPropertyOptional({ example: 'steamed white rice' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  selectedFoodName?: string;

  @ApiPropertyOptional({ example: '番茄炒蛋' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  correctedName?: string;

  @ApiPropertyOptional({ example: '01JFOOD00000000000000000001' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  selectedFoodId?: string;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  weightGram?: number;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  correctedWeightGram?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  correctedCount?: number;

  @ApiPropertyOptional({
    example: 'user_common_selected',
    enum: ['recognized', 'user_common_selected', 'system_search_selected', 'retry_recognition_selected'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['recognized', 'user_common_selected', 'system_search_selected', 'retry_recognition_selected'])
  confirmationSource?:
    | 'recognized'
    | 'user_common_selected'
    | 'system_search_selected'
    | 'retry_recognition_selected';

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
