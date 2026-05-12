import { Module } from '@nestjs/common';
import { AuthGuard } from '../../guards/auth.guard';
import { GatewayCommonModule } from '../gateway-common.module';
import { MealsController } from './meals.controller';

@Module({
  imports: [GatewayCommonModule],
  controllers: [MealsController],
  providers: [AuthGuard],
})
export class MealsModule {}
