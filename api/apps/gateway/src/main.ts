import 'reflect-metadata';
import { ensureServiceName, EnvService, getEnvNumber, getEnvString } from '@lumimax/config';
import {
  createGlobalValidationPipe,
  enableGlobalLogging,
  logBootstrapSummary,
  logRoutes,
  setupSwagger,
} from '@lumimax/http-kit';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const serviceName = 'gateway';
  ensureServiceName(serviceName);
  const app = await NestFactory.create(AppModule, {
    logger: false,
    bufferLogs: true,
    abortOnError: false,
  });
  app.useGlobalPipes(createGlobalValidationPipe());
  const logger = enableGlobalLogging(app, serviceName);
  const envService = app.get(EnvService);
  const appConfig = envService.getAppConfig();
  const gatewayConfig = envService.getGatewayConfig();
  const infrastructureConfig = envService.getInfrastructureConfig();
  const host = getEnvString('HOST', '0.0.0.0')!;
  const port = getEnvNumber('HTTP_PORT', 4000);

  const swagger = setupSwagger(app, {
    serviceName,
    title: 'Lumimax Gateway API',
    description:
      '统一 HTTP 接入层。REST 在 /api/*；聚合文档与 Swagger UI 在 /api/docs、/api/gateway-docs；健康检查 /health。',
    version: '0.1.0',
    bearerAuth: true,
    uiPath: 'api/gateway-docs',
    jsonPath: 'api/docs-json',
  });

  if (gatewayConfig.trustProxy) {
    const httpInstance = app.getHttpAdapter().getInstance();
    if (typeof httpInstance?.set === 'function') {
      httpInstance.set('trust proxy', true);
    }
  }

  app.enableCors({
    origin:
      gatewayConfig.corsOrigin === '*'
        ? true
        : gatewayConfig.corsOrigin.split(',').map((origin: string) => origin.trim()),
    credentials: true,
  });

  app.getHttpAdapter().get('/favicon.ico', (_req: unknown, res: any) => {
    res.status?.(204);
    res.send?.();
  });

  await app.listen(port, host);
  const routeSummary = logRoutes(app, logger);

  const rmqUrl = infrastructureConfig.rabbitmqUrl;

  logBootstrapSummary(logger, {
    serviceName,
    env: appConfig.nodeEnv,
    httpPort: port,
    grpc: false,
    rmq: rmqUrl ? { status: 'connected' } : false,
    redis: gatewayConfig.rateLimitEnabled
      ? {
          status: gatewayConfig.rateLimitRedisUrl ? 'configured' : 'not_configured',
          rateLimitEnabled: true,
          capacity: gatewayConfig.rateLimitCapacity,
          refillPerSecond: gatewayConfig.rateLimitRefillPerSecond,
        }
      : false,
    swaggerUrl: swagger.uiUrl,
    healthUrl: `http://localhost:${port}/health`,
    routes: routeSummary,
  });
}

function fatalExit(serviceName: string, label: string, reason: unknown): never {
  const detail = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  console.error(`[${serviceName}] ${label}\n${detail}`);
  process.exit(1);
}

process.on('unhandledRejection', (reason: unknown) => {
  fatalExit('gateway', 'unhandledRejection', reason);
});

process.on('uncaughtException', (error: Error) => {
  fatalExit('gateway', 'uncaughtException', error);
});

void bootstrap().catch((error: unknown) => {
  fatalExit('gateway', 'bootstrap failed', error);
});
