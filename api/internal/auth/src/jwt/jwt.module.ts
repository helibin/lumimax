import type { DynamicModule} from '@nestjs/common';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule as NestJwtModule } from '@nestjs/jwt';
import type { JwtModuleOptions } from './jwt.types';
import { JwtTokenService } from './jwt-token.service';

@Module({})
export class JwtModule {
  static forRoot(options: JwtModuleOptions = {}): DynamicModule {
    const secretEnvKey = options.secretEnvKey ?? 'JWT_SECRET';
    const expiresIn = options.expiresIn ?? '1d';

    return {
      module: JwtModule,
      imports: [
        ConfigModule,
        NestJwtModule.registerAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => {
            const secret = configService.get<string>(secretEnvKey);
            if (!secret) {
              throw new Error(`Missing required env: ${secretEnvKey}`);
            }
            return {
              secret,
              signOptions: { expiresIn: expiresIn as any },
            };
          },
        }),
      ],
      providers: [JwtTokenService],
      exports: [NestJwtModule, JwtTokenService],
    };
  }
}
