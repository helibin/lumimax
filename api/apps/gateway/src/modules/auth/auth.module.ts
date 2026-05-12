import { Module } from '@nestjs/common';
import { AuthGuard } from '../../guards/auth.guard';
import { GatewayCommonModule } from '../gateway-common.module';
import { AuthController } from './auth.controller';

@Module({
  imports: [GatewayCommonModule],
  controllers: [AuthController],
  providers: [AuthGuard],
})
export class AuthModule {}
