import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const MD5_HEX_REGEX = /^[a-fA-F0-9]{32}$/;

export class UserLoginRequestDto {
  @ApiProperty({ example: 'demo_c_user', description: '登录账号（可传用户名/手机号/邮箱）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  username!: string;

  @ApiProperty({
    example: '5f4dcc3b5aa765d61d8327deb882cf99',
    description: '登录密码的 MD5（32位十六进制）',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(MD5_HEX_REGEX, { message: 'password must be a 32-character md5 hex string' })
  password!: string;
}

export class UserRegisterRequestDto {
  @ApiProperty({
    example: 'phone',
    enum: ['phone', 'email', 'username'],
    description: '注册账号类型',
  })
  @IsIn(['phone', 'email', 'username'])
  registerType!: 'phone' | 'email' | 'username';

  @ApiProperty({
    example: '+8613800138000',
    description: '注册账号（手机号/邮箱/用户名）',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  account!: string;

  @ApiProperty({
    example: '5f4dcc3b5aa765d61d8327deb882cf99',
    description: '登录密码的 MD5（32位十六进制）',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(MD5_HEX_REGEX, { message: 'password must be a 32-character md5 hex string' })
  password!: string;
}

export class RefreshTokenRequestDto {
  @ApiProperty({ example: 'rt_xxx', description: '刷新令牌' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  refreshToken!: string;
}

export class LogoutRequestDto {
  @ApiProperty({ example: 'rt_xxx', description: '待注销的刷新令牌' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  refreshToken!: string;
}

export class ForgotPasswordResetRequestDto {
  @ApiProperty({
    example: 'phone',
    enum: ['phone', 'email'],
    description: '找回方式：手机或邮箱',
  })
  @IsIn(['phone', 'email'])
  verifyType!: 'phone' | 'email';

  @ApiProperty({
    example: '+8613800138000',
    description: '手机号或邮箱',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  account!: string;

  @ApiProperty({
    example: '123456',
    description: '验证码（6位数字）',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'verifyCode must be a 6-digit numeric string' })
  verifyCode!: string;

  @ApiProperty({
    example: '5f4dcc3b5aa765d61d8327deb882cf99',
    description: '新密码 MD5（32位十六进制）',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(MD5_HEX_REGEX, { message: 'newPassword must be a 32-character md5 hex string' })
  newPassword!: string;
}

export class GoogleCallbackRequestDto {
  @ApiProperty({ example: 'code-from-google', description: 'Google 回调 code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  code!: string;

  @ApiProperty({ example: 'state_abc123', description: '防重放 state' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  state!: string;
}

export class WechatLoginRequestDto {
  @ApiProperty({ example: 'wx_provider_user_id', description: '微信侧用户唯一标识' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  providerUserId!: string;

  @ApiProperty({ example: 'wx_union_id', required: false, nullable: true, description: '微信 unionId' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  unionId?: string | null;

  @ApiProperty({ example: 'wx_open_id', required: false, nullable: true, description: '微信 openId' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  openId?: string | null;

  @ApiProperty({ example: 'user@example.com', required: false, nullable: true, description: '微信绑定邮箱' })
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiProperty({ example: { channel: 'miniapp' }, required: false, description: '扩展元数据' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class AppleLoginRequestDto {
  @ApiProperty({ example: 'apple_sub_123456', description: 'Apple 用户唯一标识（sub）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  providerUserId!: string;

  @ApiProperty({ example: 'apple_user@example.com', required: false, nullable: true, description: 'Apple 返回邮箱' })
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiProperty({ example: 'eyJraWQiOiJ...', required: false, nullable: true, description: 'Apple identityToken' })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  identityToken?: string | null;

  @ApiProperty({ example: 'cfd2f1...', required: false, nullable: true, description: 'Apple authorizationCode' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  authorizationCode?: string | null;

  @ApiProperty({ example: { platform: 'ios' }, required: false, description: '扩展元数据' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
