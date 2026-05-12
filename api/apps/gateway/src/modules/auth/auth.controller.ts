import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { GrpcInvokerService } from '../grpc-invoker.service';
import {
  AppleLoginRequestDto,
  ForgotPasswordResetRequestDto,
  GoogleCallbackRequestDto,
  RefreshTokenRequestDto,
  UserLoginRequestDto,
  UserRegisterRequestDto,
  WechatLoginRequestDto,
} from '../../dto/auth.dto';
import { AuthGuard } from '../../guards/auth.guard';
import { BaseUserGrpcAdapter } from '../../grpc/base-service.grpc-client';
import { requireUser, resolveTenantScope } from '../../controllers/controller-context.util';

void AppleLoginRequestDto;
void ForgotPasswordResetRequestDto;
void GoogleCallbackRequestDto;
void RefreshTokenRequestDto;
void UserLoginRequestDto;
void UserRegisterRequestDto;
void WechatLoginRequestDto;

@ApiTags('api-auth 认证接口')
@Controller('api/auth')
export class AuthController {
  constructor(
    @Inject(GrpcInvokerService) private readonly grpcInvoker: GrpcInvokerService,
    @Inject(BaseUserGrpcAdapter) private readonly baseUserGrpcAdapter: BaseUserGrpcAdapter,
  ) {}

  @Post('login')
  @ApiOperation({
    summary: '用户登录',
    description: 'C 端登录入口。提交用户名/手机号/邮箱与 MD5 密码，成功后返回访问令牌与当前用户信息。',
  })
  @ApiBody({ type: UserLoginRequestDto, description: '登录凭据（username + md5 password）' })
  login(@Body() body: UserLoginRequestDto, @Req() req: any) {
    return this.grpcInvoker.invoke({
      service: 'base-service',
      operation: 'auth.user.login',
      requestId: req.requestId,
      call: () => this.baseUserGrpcAdapter.execute({
        operation: 'auth.user.login',
        body: body as unknown as Record<string, unknown>,
        requestId: req.requestId,
      }),
    });
  }

  @Post('user/register')
  @ApiOperation({
    summary: '用户注册',
    description: '支持手机号、邮箱或用户名注册，具体注册类型由 registerType 指定。',
  })
  @ApiBody({ type: UserRegisterRequestDto, description: '注册参数（registerType/account/password）' })
  userRegister(@Body() body: UserRegisterRequestDto, @Req() req: any) {
    return this.grpcInvoker.invoke({
      service: 'base-service',
      operation: 'auth.user.register',
      requestId: req.requestId,
      call: () => this.baseUserGrpcAdapter.execute({
        operation: 'auth.user.register',
        body: body as unknown as Record<string, unknown>,
        requestId: req.requestId,
      }),
    });
  }

  @Post('refresh')
  @ApiOperation({ summary: '刷新访问令牌', description: '使用 refreshToken 换取新的 accessToken。' })
  @ApiBody({ type: RefreshTokenRequestDto })
  refresh(@Body() body: Record<string, unknown>, @Req() req: any) {
    return this.grpcInvoker.invoke({
      service: 'base-service',
      operation: 'auth.refresh',
      requestId: req.requestId,
      call: () => this.baseUserGrpcAdapter.execute({
        operation: 'auth.refresh',
        body,
        requestId: req.requestId,
      }),
    });
  }

  @Post('logout')
  @ApiOperation({ summary: '用户注销', description: '使当前 refreshToken 失效。' })
  @ApiBody({ required: false, schema: { type: 'object', properties: { refreshToken: { type: 'string' } } } })
  logout(@Body() body: Record<string, unknown>, @Req() req: any) {
    return this.grpcInvoker.invoke({
      service: 'base-service',
      operation: 'auth.logout',
      requestId: req.requestId,
      call: () => this.baseUserGrpcAdapter.execute({
        operation: 'auth.logout',
        body,
        requestId: req.requestId,
      }),
    });
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '获取当前登录用户信息', description: '返回当前访问令牌对应的用户资料与租户上下文。' })
  me(@Req() req: any) {
    const user = requireUser(req);
    const tenantScope = resolveTenantScope(req, user);
    return this.grpcInvoker.invoke({
      service: 'base-service',
      operation: 'identity.me',
      requestId: req.requestId,
      call: () =>
        this.baseUserGrpcAdapter.execute({
          operation: 'identity.me',
          user,
          tenantScope,
          requestId: req.requestId,
        }),
    });
  }

  @Post('user/password/forgot/reset')
  @ApiOperation({
    summary: '忘记密码重置',
    description: '通过手机或邮箱验证码重置密码。',
  })
  @ApiBody({ type: ForgotPasswordResetRequestDto })
  forgotPasswordReset(@Body() body: ForgotPasswordResetRequestDto, @Req() req: any) {
    return this.grpcInvoker.invoke({
      service: 'base-service',
      operation: 'auth.password.forgot.reset',
      requestId: req.requestId,
      call: () => this.baseUserGrpcAdapter.execute({
        operation: 'auth.password.forgot.reset',
        body: body as unknown as Record<string, unknown>,
        requestId: req.requestId,
      }),
    });
  }

  @Get('google/url')
  @ApiOperation({ summary: '获取 Google 登录授权地址', description: '第三方 Google 登录预留接口。' })
  getGoogleUrl(@Req() req: any) {
    return this.grpcInvoker.invoke({
      service: 'base-service',
      operation: 'auth.google.url',
      requestId: req.requestId,
      call: () => this.baseUserGrpcAdapter.execute({
        operation: 'auth.google.url',
        requestId: req.requestId,
      }),
    });
  }

  @Get('google/callback')
  @ApiOperation({ summary: '处理 Google 回调', description: '第三方 Google 登录回调预留接口。' })
  @ApiQuery({ name: 'code', required: true, description: 'Google OAuth 授权码' })
  @ApiQuery({ name: 'state', required: true, description: 'OAuth 状态参数' })
  handleGoogleCallback(@Query() query: GoogleCallbackRequestDto, @Req() req: any) {
    return this.grpcInvoker.invoke({
      service: 'base-service',
      operation: 'auth.google.callback',
      requestId: req.requestId,
      call: () => this.baseUserGrpcAdapter.execute({
        operation: 'auth.google.callback',
        query: query as unknown as Record<string, unknown>,
        requestId: req.requestId,
      }),
    });
  }

  @Post('wechat/login')
  @ApiOperation({ summary: '微信登录', description: '通过微信授权信息完成登录。' })
  @ApiBody({ type: WechatLoginRequestDto })
  wechatLogin(@Body() body: WechatLoginRequestDto, @Req() req: any) {
    return this.grpcInvoker.invoke({
      service: 'base-service',
      operation: 'auth.wechat.login',
      requestId: req.requestId,
      call: () => this.baseUserGrpcAdapter.execute({
        operation: 'auth.wechat.login',
        body: body as unknown as Record<string, unknown>,
        requestId: req.requestId,
      }),
    });
  }

  @Post('apple/login')
  @ApiOperation({ summary: 'Apple 登录', description: '通过 Apple 授权信息完成登录。' })
  @ApiBody({ type: AppleLoginRequestDto })
  appleLogin(@Body() body: AppleLoginRequestDto, @Req() req: any) {
    return this.grpcInvoker.invoke({
      service: 'base-service',
      operation: 'auth.apple.login',
      requestId: req.requestId,
      call: () => this.baseUserGrpcAdapter.execute({
        operation: 'auth.apple.login',
        body: body as unknown as Record<string, unknown>,
        requestId: req.requestId,
      }),
    });
  }
}
