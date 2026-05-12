import { Global, Module } from '@nestjs/common';
import { AccessControlModule } from '@lumimax/auth';
import { AuthGuard } from '../guards/auth.guard';
import { GrpcInvokerService } from './grpc-invoker.service';

@Global()
@Module({
  imports: [AccessControlModule],
  providers: [GrpcInvokerService, AuthGuard],
  exports: [AccessControlModule, GrpcInvokerService, AuthGuard],
})
export class GatewayCommonModule {}
