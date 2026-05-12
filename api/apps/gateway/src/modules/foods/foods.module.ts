import { Module } from '@nestjs/common';
import { AuthGuard } from '../../guards/auth.guard';
import { GatewayCommonModule } from '../gateway-common.module';
import { FoodsController } from './foods.controller';

@Module({
  imports: [GatewayCommonModule],
  controllers: [FoodsController],
  providers: [AuthGuard],
})
export class FoodsModule {}
