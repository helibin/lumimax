import type { DynamicModule } from '@nestjs/common';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { commonConfigLoaders } from './config-registry';
import { resolveServiceEnvFilePaths } from './config-env-paths';
import { EnvService } from './env.service';

@Global()
@Module({})
export class EnvModule {
  static forRoot(): DynamicModule {
    const envFilePath = resolveServiceEnvFilePaths(process.env.SERVICE_NAME);

    return {
      module: EnvModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          expandVariables: true,
          envFilePath,
          load: commonConfigLoaders,
        }),
      ],
      providers: [EnvService],
      exports: [ConfigModule, EnvService],
    };
  }
}
