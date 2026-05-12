import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolveEnvFilePaths } from './load-env';

@Module({})
export class AppConfigModule {
  static forService(
    serviceName: string,
    options?: {
      validate?: (config: Record<string, unknown>) => Record<string, unknown>;
      load?: Array<() => Record<string, unknown>>;
    },
  ): DynamicModule {
    return {
      module: AppConfigModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: resolveEnvFilePaths(serviceName),
          validate: options?.validate,
          load: options?.load,
        }),
      ],
      exports: [ConfigModule],
    };
  }
}
