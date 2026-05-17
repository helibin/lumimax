import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from '@lumimax/database';
import { IOT_SERVICE_ENTITIES } from './iot.entities';

@Module({
  imports: [
    DatabaseModule.forRoot({
      serviceName: 'iot-service',
      entities: IOT_SERVICE_ENTITIES,
    }),
    TypeOrmModule.forFeature(IOT_SERVICE_ENTITIES),
  ],
  exports: [DatabaseModule, TypeOrmModule],
})
export class PersistenceModule {}
