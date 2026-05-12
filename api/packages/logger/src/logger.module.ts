import { Global, Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { AppLoggerService } from './app-logger.service';
import { createLoggerModuleConfig } from './logger.config';
import { RequestContextService } from './request-context.service';
import { RequestLoggingMiddleware } from './request-logging.middleware';
import { ResponseLoggingInterceptor } from './response-logging.interceptor';

@Global()
@Module({
  imports: [PinoLoggerModule.forRoot(createLoggerModuleConfig())],
  providers: [
    RequestContextService,
    AppLoggerService,
    RequestLoggingMiddleware,
    ResponseLoggingInterceptor,
  ],
  exports: [
    PinoLoggerModule,
    AppLoggerService,
    RequestContextService,
    RequestLoggingMiddleware,
    ResponseLoggingInterceptor,
  ],
})
export class LoggerModule {}
