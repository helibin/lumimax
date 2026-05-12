import { Module } from '@nestjs/common';
import { JwtModule } from '@lumimax/auth';
import { PersistenceModule } from '../../persistence/persistence.module';
import { UserController } from './user.controller';
import { UserFacadeGrpcController } from './user-facade.grpc.controller';
import { UserFacadeService } from './user-facade.service';
import { UserService } from './user.service';

@Module({
  imports: [PersistenceModule, JwtModule.forRoot()],
  controllers: [UserController, UserFacadeGrpcController],
  providers: [UserService, UserFacadeService],
  exports: [UserService, UserFacadeService],
})
export class UserModule {}
