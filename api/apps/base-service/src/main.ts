import 'reflect-metadata';
import { join } from 'node:path';
import {
  createGlobalValidationPipe,
  enableGlobalLogging,
  logBootstrapSummary,
  logRoutes,
} from '@lumimax/http-kit';
import { applySqlMigrations, ensureDatabaseReady } from '@lumimax/database';
import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import { ensureServiceName, getEnvNumber, getEnvString } from '@lumimax/config';
import { BASE_PROTO_PACKAGE } from '@lumimax/contracts';
import { AppModule } from './app.module';

const BASE_PROTO_FILE = 'base.proto';
const GRPC_LOADER_OPTIONS = {
  keepCase: true,
};

async function bootstrap(): Promise<void> {
  const serviceName = 'base-service';
  ensureServiceName(serviceName);
  await ensureDatabaseReady(serviceName);
  await applySqlMigrations(serviceName);
  const host = getEnvString('HOST', '0.0.0.0')!;
  const httpPort = getEnvNumber('HTTP_PORT', 4020);
  const grpcPort = getEnvNumber('GRPC_PORT', 4120);
  const grpcUrl = `${host}:${grpcPort}`;
  const protoPath = join(
    process.cwd(),
    '../../internal/contracts/proto',
    BASE_PROTO_FILE,
  );
  const app = await NestFactory.create(AppModule, {
    logger: false,
    bufferLogs: true,
    abortOnError: false,
  });

  app.useGlobalPipes(createGlobalValidationPipe());
  const logger = enableGlobalLogging(app, serviceName);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: BASE_PROTO_PACKAGE,
      protoPath,
      url: grpcUrl,
      loader: GRPC_LOADER_OPTIONS,
    },
  });

  await app.startAllMicroservices();
  await app.listen(httpPort, host);
  const routeSummary = logRoutes(app, logger);

  logBootstrapSummary(logger, {
    serviceName,
    env: getEnvString('NODE_ENV', 'development')!,
    httpPort,
    grpc: grpcUrl,
    rmq: false,
    redis: false,
    database: false,
    swaggerUrl: false,
    healthUrl: `http://localhost:${httpPort}/health`,
    routes: routeSummary,
  });
}

function fatalExit(label: string, reason: unknown): never {
  const detail =
    reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  process.stderr.write(`[base-service] ${label}\n${detail}\n`);
  process.exit(1);
}

process.on('unhandledRejection', (reason) => {
  fatalExit('unhandledRejection', reason);
});

process.on('uncaughtException', (error) => {
  fatalExit('uncaughtException', error);
});

void bootstrap().catch((error) => {
  fatalExit('bootstrap failed', error);
});
