import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from '@lumimax/database';
import { BASE_SERVICE_ENTITIES } from './base.entities';

@Module({
  imports: [
    DatabaseModule.forRoot({
      serviceName: 'base-service',
      entities: BASE_SERVICE_ENTITIES,
    }),
    TypeOrmModule.forFeature(BASE_SERVICE_ENTITIES),
  ],
  exports: [DatabaseModule, TypeOrmModule],
})
export class PersistenceModule {}
