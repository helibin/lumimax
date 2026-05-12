import { Body, Controller, Get, Inject, Post, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminInitializeDto } from '../dto/admin-common.dto';
import { AdminAuthService } from '../auth/admin-auth.service';

@ApiTags('后台系统初始化接口')
@Controller('api/admin/system')
export class AdminSystemSetupController {
  constructor(@Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService) {}

  @Get('status')
  @ApiOperation({ summary: '查询系统初始化状态', description: '用于后台管理站首次安装向导判断系统是否已完成初始化。' })
  status(@Req() req: any) {
    return this.adminAuthService.getInitStatus({
      requestId: req.requestId,
    });
  }

  @Post('setup')
  @ApiOperation({ summary: '执行系统初始化', description: '首次初始化系统基础种子数据并设置管理员账号。' })
  @ApiBody({ type: AdminInitializeDto, description: '初始化管理员账号与运行模式信息' })
  setup(@Req() req: any, @Body() body: AdminInitializeDto) {
    return this.adminAuthService.initialize({
      requestId: req.requestId,
      username: body.username,
      password: body.password,
      nickname: body.nickname,
      email: body.email,
      usageMode: body.usageMode,
    });
  }
}
