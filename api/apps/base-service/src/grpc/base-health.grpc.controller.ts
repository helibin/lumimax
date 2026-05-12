import { Controller, Inject } from '@nestjs/common';
import { resolveGrpcRequestId } from '@lumimax/integration/grpc/gateway-grpc.util';
import { GrpcMethod } from '@nestjs/microservices';
import { AuthService } from '../modules/auth/auth.service';
import { NotificationService } from '../modules/notification/notification.service';
import { StorageService } from '../modules/storage/storage.service';
import { SystemService } from '../modules/system/system.service';
import { UserService } from '../modules/user/user.service';

@Controller()
export class BaseHealthGrpcController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(UserService) private readonly userService: UserService,
    @Inject(SystemService) private readonly systemService: SystemService,
    @Inject(NotificationService)
    private readonly notificationService: NotificationService,
    @Inject(StorageService) private readonly storageService: StorageService,
  ) {}

  @GrpcMethod('BaseHealthService', 'Ping')
  ping(payload?: { request_id?: string }, metadata?: unknown) {
    const requestId = resolveGrpcRequestId(payload?.request_id, metadata);
    return {
      service: 'base-service',
      status: 'ok',
      requestId,
      modules: [
        this.authService.getStatus(),
        this.userService.getStatus(),
        this.systemService.getStatus(),
        this.notificationService.getStatus(),
        this.storageService.getStatus(),
      ],
    };
  }
}
