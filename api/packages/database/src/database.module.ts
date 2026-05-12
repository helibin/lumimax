import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { DatabaseModuleOptions } from './database.config';
import { createTypeOrmOptions } from './typeorm-options.factory';

@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseModuleOptions): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [
        TypeOrmModule.forRootAsync({
          useFactory: () => createTypeOrmOptions(options),
        }),
      ],
      exports: [TypeOrmModule],
    };
  }
}
