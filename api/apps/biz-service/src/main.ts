import 'reflect-metadata';
import { join } from 'node:path';
import {
  createGlobalValidationPipe,
  enableGlobalLogging,
  logBootstrapSummary,
  logRoutes,
} from '@lumimax/http-kit';
import { ensureDatabaseReady } from '@lumimax/database';
import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import {
  ensureServiceName,
  getEnvNumber,
  getEnvString,
  resolveRabbitMqTopologyCatalog,
  shouldRejectEmqxHttpStyleUplinkIngest,
} from '@lumimax/config';
import { BIZ_PROTO_PACKAGE } from '@lumimax/contracts';
import { pruneBizQueueIotBridgeBindings } from '@lumimax/mq';
import { AppModule } from './app.module';
import { IotBridgeIncomingDeserializer } from './iot/transport/iot-bridge-rmq.incoming.deserializer';
import {
  resolveBizConsumerQueueOptions,
  resolveBizEventsQueueName,
  resolveIotBridgePrefetchCount,
  resolveIotBridgeRabbitmqUrl,
  shouldUseIotBridgeRabbitmq,
} from './iot/transport/iot-bridge.rabbitmq';

const BIZ_PROTO_FILE = 'biz.proto';
const GRPC_LOADER_OPTIONS = {
  keepCase: true,
};

async function bootstrap(): Promise<void> {
  const serviceName = 'biz-service';
  ensureServiceName(serviceName);
  await ensureDatabaseReady(serviceName);
  const database = resolveDatabaseLogValue();
  const rabbitmqCatalog = resolveRabbitMqTopologyCatalog(process.env);
  const rmqUrl = resolveIotBridgeRabbitmqUrl();
  if (shouldRejectEmqxHttpStyleUplinkIngest() && !rmqUrl) {
    throw new Error(
      'RABBITMQ_URL is required when IOT_VENDOR=emqx and IOT_RECEIVE_MODE=mq (RabbitMQ is the only uplink path; biz-service must subscribe to the IoT bridge queue).',
    );
  }
  const host = getEnvString('HOST', '0.0.0.0')!;
  const httpPort = getEnvNumber('HTTP_PORT', 4030);
  const grpcPort = getEnvNumber('GRPC_PORT', 4130);
  const grpcUrl = `${host}:${grpcPort}`;
  const protoPath = join(
    process.cwd(),
    '../../internal/contracts/proto',
    BIZ_PROTO_FILE,
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
      package: BIZ_PROTO_PACKAGE,
      protoPath,
      url: grpcUrl,
      loader: GRPC_LOADER_OPTIONS,
    },
  });
  const rmqEnabled = shouldUseIotBridgeRabbitmq();
  if (rmqEnabled) {
    try {
      await pruneBizQueueIotBridgeBindings(process.env);
    } catch (error) {
      logger.warn(
        '清理 biz 队列上的遗留 IoT bridge 绑定时失败（可稍后执行 pnpm mq:setup）',
        {
          reason: error instanceof Error ? error.message : String(error),
        },
      );
    }
    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.RMQ,
      options: {
        urls: [rmqUrl!],
        queue: resolveBizEventsQueueName(),
        queueOptions: resolveBizConsumerQueueOptions(),
        exchange: rabbitmqCatalog.broker.exchange,
        exchangeType: rabbitmqCatalog.broker.exchangeType as 'direct' | 'fanout' | 'topic' | 'headers',
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
    rmq: rmqEnabled ? maskSensitiveUrl(rmqUrl) : false,
    redis: false,
    database,
    swaggerUrl: false,
    healthUrl: `http://localhost:${httpPort}/health`,
    routes: routeSummary,
  });
}

function resolveDatabaseLogValue(): string | false {
  return maskSensitiveUrl(getEnvString('DB_URL'));
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
  process.stderr.write(`[biz-service] ${label}\n${detail}\n`);
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
