import { Controller, Inject } from '@nestjs/common';
import { parseGrpcFacadeExecutePayload } from '@lumimax/integration/grpc/facade-execute.util';
import { GrpcMethod } from '@nestjs/microservices';
import { NotificationFacadeService } from './notification-facade.service';

@Controller()
export class NotificationFacadeGrpcController {
  constructor(
    @Inject(NotificationFacadeService)
    private readonly notificationFacadeService: NotificationFacadeService,
  ) {}

  @GrpcMethod('BaseNotificationFacadeService', 'Execute')
  execute(
    payload: Parameters<typeof parseGrpcFacadeExecutePayload>[0],
    metadata?: unknown,
  ) {
    return this.notificationFacadeService.execute(
      parseGrpcFacadeExecutePayload(payload, metadata),
    );
  }
}
