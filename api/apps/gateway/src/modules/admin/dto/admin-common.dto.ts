import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const MD5_HEX_REGEX = /^[a-fA-F0-9]{32}$/;

export class AdminPageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  keyword?: string;
}

export class AdminStatusBodyDto {
  @IsString()
  @IsIn(['active', 'disabled'])
  status!: string;
}

export class AdminLoginDto {
  @IsString()
  username!: string;

  @IsString()
  @Matches(MD5_HEX_REGEX, { message: 'password must be a 32-character md5 hex string' })
  password!: string;
}

export class AdminInitializeDto {
  @IsString()
  username!: string;

  @IsString()
  nickname!: string;

  @IsString()
  @Matches(MD5_HEX_REGEX, { message: 'password must be a 32-character md5 hex string' })
  password!: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  usageMode?: string;
}

export class CreateAdminUserDto {
  @IsString()
  username!: string;

  @IsString()
  @Matches(MD5_HEX_REGEX, { message: 'password must be a 32-character md5 hex string' })
  password!: string;

  @IsString()
  nickname!: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];
}

export class UpdateAdminUserDto {
  @IsOptional()
  @IsString()
  nickname?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];
}

export class ResetAdminUserPasswordDto {
  @IsString()
  @Matches(MD5_HEX_REGEX, { message: 'newPassword must be a 32-character md5 hex string' })
  newPassword!: string;
}

export class CreateRoleDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateRolePermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissionIds!: string[];
}

export class UpdateRoleMenusDto {
  @IsArray()
  @IsString({ each: true })
  menuIds!: string[];
}

export class CreateSystemMenuDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsIn(['catalog', 'menu', 'button', 'external'])
  menuType?: string;

  @IsOptional()
  @IsString()
  routePath?: string;

  @IsOptional()
  @IsString()
  component?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  permissionCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort?: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  visible?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  keepAlive?: boolean;

  @IsOptional()
  @IsString()
  externalLink?: string;

  @IsOptional()
  extra?: Record<string, unknown>;
}

export class UpdateSystemMenuDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsIn(['catalog', 'menu', 'button', 'external'])
  menuType?: string;

  @IsOptional()
  @IsString()
  routePath?: string;

  @IsOptional()
  @IsString()
  component?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  permissionCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort?: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  visible?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  keepAlive?: boolean;

  @IsOptional()
  @IsString()
  externalLink?: string;

  @IsOptional()
  extra?: Record<string, unknown>;
}

export class CreateDictionaryDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateDictionaryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateDictionaryItemDto {
  @IsString()
  label!: string;

  @IsString()
  value!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort?: number;

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: string;

  @IsOptional()
  extra?: Record<string, unknown>;
}

export class UpdateDictionaryItemDto extends CreateDictionaryItemDto {}

export class CreateSystemConfigDto {
  @IsString()
  configKey!: string;

  @IsString()
  configValue!: string;

  @IsString()
  @IsIn(['string', 'number', 'boolean', 'json'])
  valueType!: string;

  @IsString()
  groupCode!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(({ value }) => Boolean(value))
  @IsBoolean()
  isEncrypted?: boolean;
}

export class UpdateSystemConfigDto extends CreateSystemConfigDto {}

export class AdminAuditLogQueryDto extends AdminPageQueryDto {
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  resourceType?: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;
}
