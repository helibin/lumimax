import { Module } from '@nestjs/common';
import { OssStorageProvider, S3StorageProvider } from '@lumimax/storage';
import { PersistenceModule } from '../../persistence/persistence.module';
import { StorageController } from './storage.controller';
import { StorageFacadeGrpcController } from './storage-facade.grpc.controller';
import { StorageFacadeService } from './storage-facade.service';
import { StorageService } from './storage.service';
import { AwsStsService } from './aws-sts.service';
import { AliyunStsService } from './aliyun-sts.service';

@Module({
  imports: [PersistenceModule],
  controllers: [StorageController, StorageFacadeGrpcController],
  providers: [
    AwsStsService,
    AliyunStsService,
    S3StorageProvider,
    OssStorageProvider,
    StorageService,
    StorageFacadeService,
  ],
  exports: [StorageService, StorageFacadeService],
})
export class StorageModule {}
