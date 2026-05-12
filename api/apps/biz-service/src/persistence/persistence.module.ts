import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from '@lumimax/database';
import { BIZ_SERVICE_ENTITIES } from './biz.entities';

@Module({
  imports: [
    DatabaseModule.forRoot({
      serviceName: 'biz-service',
      entities: BIZ_SERVICE_ENTITIES,
    }),
    TypeOrmModule.forFeature(BIZ_SERVICE_ENTITIES),
  ],
  exports: [DatabaseModule, TypeOrmModule],
})
export class PersistenceModule {}
