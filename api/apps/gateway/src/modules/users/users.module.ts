import { Module } from '@nestjs/common';
import { AuthGuard } from '../../guards/auth.guard';
import { GatewayCommonModule } from '../gateway-common.module';
import { IdentityController } from './identity.controller';
import { PrivacyController } from './privacy.controller';
import { UsersController } from './users.controller';

@Module({
  imports: [GatewayCommonModule],
  controllers: [UsersController, IdentityController, PrivacyController],
  providers: [AuthGuard],
})
export class UsersModule {}
