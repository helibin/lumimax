import { Module } from '@nestjs/common';
import { PersistenceModule } from '../../persistence/persistence.module';
import { NotificationFacadeGrpcController } from './notification-facade.grpc.controller';
import { NotificationFacadeService } from './notification-facade.service';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

@Module({
  imports: [PersistenceModule],
  controllers: [NotificationController, NotificationFacadeGrpcController],
  providers: [NotificationService, NotificationFacadeService],
  exports: [NotificationService, NotificationFacadeService],
})
export class NotificationModule {}
