import { Body, Controller, Get, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminLoginDto } from '../dto/admin-common.dto';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminCurrentUser } from './admin-current-user.decorator';
import type { AuthenticatedUser } from '@lumimax/auth';

@ApiTags('后台认证接口')
@Controller('api/admin/auth')
export class AdminAuthController {
  constructor(@Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  @ApiOperation({ summary: '后台管理员登录', description: '后台管理站登录入口，返回管理员访问令牌与权限信息。' })
  @ApiBody({ type: AdminLoginDto, description: '后台管理员登录凭据' })
  login(@Req() req: any, @Body() body: AdminLoginDto) {
    return this.adminAuthService.login({
      requestId: req.requestId,
      username: body.username,
      password: body.password,
    });
  }

  @Get('me')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '获取当前后台管理员信息', description: '返回当前后台登录管理员的基础信息。' })
  me(@Req() req: any, @AdminCurrentUser() user?: AuthenticatedUser) {
    return this.adminAuthService.me({
      requestId: req.requestId,
      adminId: user?.userId ?? '',
    });
  }

  @Post('logout')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '后台管理员登出', description: '当前版本返回前端登出成功响应，用于清理本地登录态。' })
  logout() {
    return { ok: true };
  }
}
