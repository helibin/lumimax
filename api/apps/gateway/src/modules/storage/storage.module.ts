import { Module } from '@nestjs/common';
import { AuthGuard } from '../../guards/auth.guard';
import { GatewayCommonModule } from '../gateway-common.module';
import { StorageController } from './storage.controller';
import { StoragePublicController } from './storage-public.controller';

@Module({
  imports: [GatewayCommonModule],
  controllers: [StorageController, StoragePublicController],
  providers: [AuthGuard],
})
export class StorageModule {}
