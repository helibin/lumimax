import 'reflect-metadata';
import { join } from 'node:path';
import { ensureDatabaseReady } from '@lumimax/database';
import {
  createGlobalValidationPipe,
  enableGlobalLogging,
  logBootstrapSummary,
  logRoutes,
} from '@lumimax/http-kit';
import {
  ensureServiceName,
  getEnvNumber,
  getEnvString,
  resolveRabbitMqTopologyCatalog,
} from '@lumimax/config';
import { BIZ_PROTO_PACKAGE } from '@lumimax/contracts';
import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { IotBridgeIncomingDeserializer } from './transport/iot-bridge-rmq.incoming.deserializer';
import {
  ensureIotDeadLetterTopology,
  resolveIotBridgePrefetchCount,
  resolveIotBridgeRabbitmqUrl,
  resolveIotConsumerQueueOptions,
  resolveIotQueueName,
} from './transport/iot-bridge.rabbitmq';

const BIZ_PROTO_FILE = 'biz.proto';
const GRPC_LOADER_OPTIONS = { keepCase: true };

async function bootstrap(): Promise<void> {
  const serviceName = 'iot-service';
  ensureServiceName(serviceName);
  await ensureDatabaseReady(serviceName);

  const host = getEnvString('HOST', '0.0.0.0')!;
  const httpPort = getEnvNumber('HTTP_PORT', 4040);
  const grpcPort = getEnvNumber('GRPC_PORT', 4140);
  const grpcUrl = `${host}:${grpcPort}`;
  const rmqUrl = resolveIotBridgeRabbitmqUrl();
  const rabbitmqCatalog = resolveRabbitMqTopologyCatalog(process.env);
  const protoPath = join(process.cwd(), '../../internal/contracts/proto', BIZ_PROTO_FILE);

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
      package: BIZ_PROTO_PACKAGE,
      protoPath,
      url: grpcUrl,
      loader: GRPC_LOADER_OPTIONS,
    },
  });

  if (rmqUrl) {
    await ensureIotDeadLetterTopology();
    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.RMQ,
      options: {
        urls: [rmqUrl],
        queue: resolveIotQueueName(),
        queueOptions: resolveIotConsumerQueueOptions(),
        exchange: rabbitmqCatalog.broker.exchange,
        exchangeType: rabbitmqCatalog.broker.exchangeType as
          | 'direct'
          | 'fanout'
          | 'topic'
          | 'headers',
        prefetchCount: resolveIotBridgePrefetchCount(),
        noAck: false,
        wildcards: true,
        deserializer: new IotBridgeIncomingDeserializer(),
      },
    });
  }

  await app.startAllMicroservices();
  await app.listen(httpPort, host);
  const routeSummary = logRoutes(app, logger);
  logBootstrapSummary(logger, {
    serviceName,
    env: getEnvString('NODE_ENV', 'development')!,
    httpPort,
    grpc: grpcUrl,
    rmq: rmqUrl ? maskSensitiveUrl(rmqUrl) : false,
    redis: false,
    database: maskSensitiveUrl(getEnvString('DB_URL')),
    swaggerUrl: false,
    healthUrl: `http://localhost:${httpPort}/health`,
    routes: routeSummary,
  });
}

function maskSensitiveUrl(url?: string): string | false {
  const value = url?.trim();
  if (!value) {
    return false;
  }
  try {
    const parsed = new URL(value);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return value;
  }
}

function fatalExit(label: string, reason: unknown): never {
  const detail =
    reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  process.stderr.write(`[iot-service] ${label}\n${detail}\n`);
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
