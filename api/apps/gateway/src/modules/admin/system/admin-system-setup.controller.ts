import { Body, Controller, Get, Inject, Post, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminInitializeDto } from '../dto/admin-common.dto';
import { AdminAuthService } from '../auth/admin-auth.service';
import { AdminRabbitMqSetupService } from './admin-rabbitmq-setup.service';

@ApiTags('后台系统初始化接口')
@Controller('api/admin/system')
export class AdminSystemSetupController {
  constructor(
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService,
    @Inject(AdminRabbitMqSetupService)
    private readonly adminRabbitMqSetupService: AdminRabbitMqSetupService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: '查询系统初始化状态', description: '用于后台管理站首次安装向导判断系统是否已完成初始化。' })
  async status(@Req() req: any) {
    const [initStatus, rabbitmq] = await Promise.all([
      this.adminAuthService.getInitStatus({
        requestId: req.requestId,
      }),
      this.adminRabbitMqSetupService.getStatus(),
    ]);
    return {
      ...initStatus,
      rabbitmq,
      rabbitmqReady: rabbitmq.ready,
      warnings: [
        ...normalizeWarnings(initStatus.warnings),
        ...rabbitmq.warnings,
      ],
    };
  }

  @Post('rabbitmq/setup')
  @ApiOperation({ summary: '执行 RabbitMQ 初始化', description: '创建部署所需的 RabbitMQ vhost、exchange、queue 和 DLQ 拓扑。' })
  async setupRabbitmq() {
    const rabbitmq = await this.adminRabbitMqSetupService.setup();
    return {
      rabbitmq,
      rabbitmqReady: rabbitmq.ready,
      warnings: rabbitmq.warnings,
    };
  }

  @Post('setup')
  @ApiOperation({ summary: '执行系统初始化', description: '首次初始化系统基础种子数据并设置管理员账号。' })
  @ApiBody({ type: AdminInitializeDto, description: '初始化管理员账号与运行模式信息' })
  async setup(@Req() req: any, @Body() body: AdminInitializeDto) {
    const rabbitmq = await this.adminRabbitMqSetupService.setup();
    const result = await this.adminAuthService.initialize({
      requestId: req.requestId,
      username: body.username,
      password: body.password,
      nickname: body.nickname,
      email: body.email,
      usageMode: body.usageMode,
    });
    return {
      ...result,
      rabbitmq,
      rabbitmqReady: rabbitmq.ready,
      warnings: rabbitmq.warnings,
    };
  }
}

function normalizeWarnings(input: unknown): string[] {
  return Array.isArray(input) ? input.map((item) => String(item)) : [];
}
