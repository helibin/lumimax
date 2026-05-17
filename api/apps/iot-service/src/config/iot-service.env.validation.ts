import { plainToInstance, Transform } from 'class-transformer';
import {
  IOT_BRIDGE_DEFAULT_PREFETCH,
  IOT_RABBITMQ_DEFAULT_QUEUE,
  RABBITMQ_DEFAULT_DLX_QUEUE,
} from '@lumimax/config';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  validateSync,
} from 'class-validator';

export class IotServiceEnv {
  @IsString()
  @IsNotEmpty()
  NODE_ENV!: string;

  @IsString()
  SERVICE_NAME = 'iot-service';

  @IsOptional()
  @IsString()
  HOST = '0.0.0.0';

  @IsOptional()
  @IsString()
  DEFAULT_LOCALE = 'en-US';

  @IsOptional()
  @IsString()
  @IsIn(['CN', 'US', 'cn', 'us'])
  DEFAULT_MARKET = 'US';

  @Transform(({ value }) => Number(value ?? 4040))
  @IsInt()
  @Min(1)
  HTTP_PORT = 4040;

  @Transform(({ value }) => Number(value ?? 4140))
  @IsInt()
  @Min(1)
  GRPC_PORT = 4140;

  @IsOptional()
  @IsString()
  @IsIn(['aws', 'emqx'])
  IOT_VENDOR = 'emqx';

  @IsOptional()
  @IsString()
  @IsIn(['mq', 'callback'])
  IOT_RECEIVE_MODE = 'mq';

  @IsOptional()
  @IsString()
  AWS_SQS_QUEUE_URL = '';

  @IsOptional()
  @IsString()
  EMQX_BROKER_URL = '';

  @IsOptional()
  @IsString()
  EMQX_DEVICE_ENDPOINT = '';

  @IsOptional()
  @IsString()
  AWS_IOT_ENDPOINT = '';

  @IsOptional()
  @IsString()
  EMQX_REGION = '';

  @IsOptional()
  @IsString()
  AWS_IOT_POLICY_NAME = '';

  @IsOptional()
  @IsString()
  EMQX_ROOT_CA_PEM = '';

  @IsOptional()
  @IsString()
  EMQX_ROOT_CA_KEY_PEM = '';

  @IsOptional()
  @IsString()
  EMQX_ROOT_CA_PEM_PATH = '';

  @IsOptional()
  @IsString()
  EMQX_ROOT_CA_KEY_PEM_PATH = '';

  @IsOptional()
  @IsString()
  EMQX_MQTT_USERNAME = '';

  @IsOptional()
  @IsString()
  EMQX_MQTT_PASSWORD = '';

  @IsOptional()
  @IsString()
  EMQX_MQTT_CLIENT_CERT_PEM = '';

  @IsOptional()
  @IsString()
  EMQX_MQTT_CLIENT_KEY_PEM = '';

  @IsOptional()
  @IsString()
  EMQX_MQTT_CLIENT_CERT_PEM_PATH = '';

  @IsOptional()
  @IsString()
  EMQX_MQTT_CLIENT_KEY_PEM_PATH = '';

  @IsOptional()
  @IsString()
  EMQX_HTTP_BASE_URL = '';

  @IsOptional()
  @IsString()
  EMQX_HTTP_TLS_INSECURE = '';

  @IsOptional()
  @IsString()
  EMQX_AUTH_SECRET = '';

  @IsOptional()
  @IsString()
  EMQX_SHARED_SUBSCRIPTION_GROUP = 'lumimax-iot';

  @IsOptional()
  @IsString()
  EMQX_SHARED_SUBSCRIPTION_TOPICS = 'v1/+/+/req';

  @IsOptional()
  @IsString()
  IOT_RABBITMQ_QUEUE = IOT_RABBITMQ_DEFAULT_QUEUE;

  @IsOptional()
  @IsString()
  RABBITMQ_DLX_QUEUE = RABBITMQ_DEFAULT_DLX_QUEUE;

  @Transform(({ value }) => (value == null || value === '' ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(1000)
  IOT_RABBITMQ_MESSAGE_TTL_MS?: number;

  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  IOT_BRIDGE_RABBITMQ_PREFETCH = IOT_BRIDGE_DEFAULT_PREFETCH;

  @Transform(({ value }) => Number(value ?? 10))
  @IsInt()
  @Min(1)
  AWS_SQS_WAIT_TIME_SECONDS = 10;

  @Transform(({ value }) => Number(value ?? 60))
  @IsInt()
  @Min(1)
  AWS_SQS_VISIBILITY_TIMEOUT = 60;

  @Transform(({ value }) => Number(value ?? 5))
  @IsInt()
  @Min(1)
  AWS_SQS_BATCH_SIZE = 5;

  @Transform(({ value }) => Number(value ?? 1000))
  @IsInt()
  @Min(100)
  AWS_SQS_IDLE_DELAY_MS = 1000;

  @Transform(({ value }) => Number(value ?? 120))
  @IsInt()
  @Min(15)
  IOT_DEVICE_OFFLINE_TIMEOUT = 120;

  @Transform(({ value }) => Number(value ?? 30000))
  @IsInt()
  @Min(5000)
  IOT_DEVICE_OFFLINE_INTERVAL = 30000;

  @IsOptional()
  @IsString()
  BASE_SERVICE_GRPC_ENDPOINT = '127.0.0.1:4120';

  @IsOptional()
  @IsString()
  IOT_REGION = '';

  @IsOptional()
  @IsString()
  IOT_ACCESS_KEY_ID = '';

  @IsOptional()
  @IsString()
  IOT_ACCESS_KEY_SECRET = '';
}

export function validateIotServiceEnv(
  config: Record<string, unknown>,
): IotServiceEnv {
  const validated = plainToInstance(
    IotServiceEnv,
    {
      ...config,
      IOT_VENDOR: config.IOT_VENDOR ?? 'emqx',
      AWS_SQS_QUEUE_URL: config.AWS_SQS_QUEUE_URL ?? '',
      EMQX_BROKER_URL: config.EMQX_BROKER_URL ?? '',
      EMQX_DEVICE_ENDPOINT: config.EMQX_DEVICE_ENDPOINT ?? '',
      AWS_IOT_ENDPOINT: config.AWS_IOT_ENDPOINT ?? '',
      EMQX_REGION: config.EMQX_REGION ?? '',
      AWS_IOT_POLICY_NAME: config.AWS_IOT_POLICY_NAME ?? '',
      EMQX_ROOT_CA_PEM: config.EMQX_ROOT_CA_PEM ?? '',
      EMQX_ROOT_CA_KEY_PEM: config.EMQX_ROOT_CA_KEY_PEM ?? '',
      EMQX_ROOT_CA_PEM_PATH: config.EMQX_ROOT_CA_PEM_PATH ?? '',
      EMQX_ROOT_CA_KEY_PEM_PATH: config.EMQX_ROOT_CA_KEY_PEM_PATH ?? '',
      EMQX_MQTT_CLIENT_CERT_PEM: config.EMQX_MQTT_CLIENT_CERT_PEM ?? '',
      EMQX_MQTT_CLIENT_KEY_PEM: config.EMQX_MQTT_CLIENT_KEY_PEM ?? '',
      EMQX_MQTT_CLIENT_CERT_PEM_PATH: config.EMQX_MQTT_CLIENT_CERT_PEM_PATH ?? '',
      EMQX_MQTT_CLIENT_KEY_PEM_PATH: config.EMQX_MQTT_CLIENT_KEY_PEM_PATH ?? '',
      AWS_SQS_WAIT_TIME_SECONDS: config.AWS_SQS_WAIT_TIME_SECONDS ?? 10,
      AWS_SQS_VISIBILITY_TIMEOUT: config.AWS_SQS_VISIBILITY_TIMEOUT ?? 60,
      AWS_SQS_BATCH_SIZE: config.AWS_SQS_BATCH_SIZE ?? 5,
      AWS_SQS_IDLE_DELAY_MS: config.AWS_SQS_IDLE_DELAY_MS ?? 1000,
      SERVICE_NAME: config.SERVICE_NAME ?? 'iot-service',
      IOT_REGION: config.IOT_REGION ?? '',
      IOT_ACCESS_KEY_ID: config.IOT_ACCESS_KEY_ID ?? '',
      IOT_ACCESS_KEY_SECRET: config.IOT_ACCESS_KEY_SECRET ?? '',
    },
    { enableImplicitConversion: true },
  );
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(
      `Invalid environment variables: ${errors
        .flatMap((error) => Object.values(error.constraints ?? {}))
        .join(', ')}`,
    );
  }
  if (validated.IOT_VENDOR === 'emqx') {
    const hasRootCaPem =
      Boolean(validated.EMQX_ROOT_CA_PEM.trim()) || Boolean(validated.EMQX_ROOT_CA_PEM_PATH.trim());
    const hasRootCaKeyPem =
      Boolean(validated.EMQX_ROOT_CA_KEY_PEM.trim())
      || Boolean(validated.EMQX_ROOT_CA_KEY_PEM_PATH.trim());
    if (!hasRootCaPem || !hasRootCaKeyPem) {
      throw new Error(
        'Invalid environment variables: EMQX device credential provisioning requires EMQX_ROOT_CA_PEM and EMQX_ROOT_CA_KEY_PEM, or their corresponding *_PATH settings',
      );
    }
  }
  return validated;
}
