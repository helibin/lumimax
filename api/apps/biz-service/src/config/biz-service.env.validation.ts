import { plainToInstance, Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  validateSync,
} from 'class-validator';

class BizServiceEnvSchema {
  @IsString()
  @IsNotEmpty()
  NODE_ENV!: string;

  @IsString()
  SERVICE_NAME = 'biz-service';

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

  @Transform(({ value }) => Number(value ?? 4030))
  @IsInt()
  @Min(1)
  HTTP_PORT = 4030;

  @Transform(({ value }) => Number(value ?? 4130))
  @IsInt()
  @Min(1)
  GRPC_PORT = 4130;

  @IsOptional()
  @IsString()
  @IsIn(['aws', 'aliyun', 'emqx'])
  IOT_VENDOR = 'emqx';

  @IsOptional()
  @IsString()
  @IsIn(['queue', 'callback'])
  IOT_RECEIVE_MODE = 'callback';

  @IsOptional()
  @IsString()
  IOT_QUEUE_URL = '';

  @IsOptional()
  @IsString()
  IOT_ENDPOINT = '';

  @IsOptional()
  @IsString()
  IOT_POLICY_NAME = '';

  @IsOptional()
  @IsString()
  IOT_ROOT_CA_PEM = '';

  @IsOptional()
  @IsString()
  IOT_ROOT_CA_KEY_PEM = '';

  @IsOptional()
  @IsString()
  IOT_MQTT_USERNAME = '';

  @IsOptional()
  @IsString()
  IOT_MQTT_PASSWORD = '';

  @IsOptional()
  @IsString()
  IOT_MQTT_CLIENT_CERT_PEM = '';

  @IsOptional()
  @IsString()
  IOT_MQTT_CLIENT_KEY_PEM = '';

  @IsOptional()
  @IsString()
  IOT_INTERNAL_SHARED_SECRET = '';

  @Transform(({ value }) => Number(value ?? 10))
  @IsInt()
  @Min(1)
  IOT_QUEUE_WAIT_TIME_SECONDS = 10;

  @Transform(({ value }) => Number(value ?? 60))
  @IsInt()
  @Min(1)
  IOT_QUEUE_VISIBILITY_TIMEOUT = 60;

  @Transform(({ value }) => Number(value ?? 5))
  @IsInt()
  @Min(1)
  IOT_QUEUE_BATCH_SIZE = 5;

  @Transform(({ value }) => Number(value ?? 1000))
  @IsInt()
  @Min(100)
  IOT_QUEUE_IDLE_DELAY_MS = 1000;

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
  LLM_VISION_PROVIDER = 'openai';

  @IsOptional()
  @IsString()
  LLM_VISION_TIMEOUT_MS = '15000';

  @IsOptional()
  @IsString()
  NUTRITION_DATA_PROVIDERS = 'nutritionix,boohee,usda_fdc,edamam';

  @IsOptional()
  @IsString()
  NUTRITIONIX_APP_ID = '';

  @IsOptional()
  @IsString()
  NUTRITIONIX_API_KEY = '';

  @IsOptional()
  @IsString()
  NUTRITIONIX_BASE_URL = 'https://trackapi.nutritionix.com';

  @Transform(({ value }) => Number(value ?? 8000))
  @IsInt()
  @Min(1000)
  NUTRITIONIX_TIMEOUT_MS = 8000;

  @IsOptional()
  @IsString()
  USDA_FDC_API_KEY = '';

  @IsOptional()
  @IsString()
  USDA_FDC_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

  @Transform(({ value }) => Number(value ?? 8000))
  @IsInt()
  @Min(1000)
  USDA_FDC_TIMEOUT_MS = 8000;

  @IsOptional()
  @IsString()
  OPEN_FOOD_FACTS_BASE_URL = 'https://world.openfoodfacts.org';

  @Transform(({ value }) => Number(value ?? 8000))
  @IsInt()
  @Min(1000)
  OPEN_FOOD_FACTS_TIMEOUT_MS = 8000;

  @IsOptional()
  @IsString()
  EDAMAM_APP_ID = '';

  @IsOptional()
  @IsString()
  EDAMAM_API_KEY = '';

  @IsOptional()
  @IsString()
  EDAMAM_BASE_URL = 'https://api.edamam.com';

  @Transform(({ value }) => Number(value ?? 8000))
  @IsInt()
  @Min(1000)
  EDAMAM_TIMEOUT_MS = 8000;

  @IsOptional()
  @IsString()
  LLM_NUTRITION_PROVIDER = 'openai';

  @Transform(({ value }) => Number(value ?? 15000))
  @IsInt()
  @Min(1000)
  NUTRITION_ESTIMATOR_TIMEOUT_MS = 15000;

  @IsOptional()
  @IsString()
  LLM_VISION_BASE_URL = '';

  @IsOptional()
  @IsString()
  LLM_VISION_AK = '';

  @IsOptional()
  @IsString()
  LLM_NUTRITION_AK = '';

  @IsOptional()
  @IsString()
  LLM_VISION_MODEL = 'gpt-4.1-mini';

  @IsOptional()
  @IsString()
  LLM_NUTRITION_BASE_URL = '';

  @IsOptional()
  @IsString()
  LLM_NUTRITION_MODEL = 'gpt-4.1-mini';

  @IsOptional()
  @IsString()
  @IsIn(['true', 'false'])
  STARTUP_THIRD_PARTY_CHECK_ENABLED = 'true';

  @IsOptional()
  @IsString()
  @IsIn(['true', 'false'])
  STARTUP_THIRD_PARTY_CHECK_STRICT = 'false';

  @Transform(({ value }) => Number(value ?? 5000))
  @IsInt()
  @Min(500)
  STARTUP_THIRD_PARTY_CHECK_TIMEOUT_MS = 5000;
}

export function validateBizServiceEnv(
  config: Record<string, unknown>,
): BizServiceEnvSchema {
  const validated = plainToInstance(
    BizServiceEnvSchema,
    {
      ...config,
      IOT_VENDOR: config.IOT_VENDOR ?? 'emqx',
      IOT_QUEUE_URL: config.IOT_QUEUE_URL ?? '',
      IOT_ENDPOINT: config.IOT_ENDPOINT ?? '',
      IOT_POLICY_NAME: config.IOT_POLICY_NAME ?? '',
      IOT_QUEUE_WAIT_TIME_SECONDS: config.IOT_QUEUE_WAIT_TIME_SECONDS ?? 10,
      IOT_QUEUE_VISIBILITY_TIMEOUT: config.IOT_QUEUE_VISIBILITY_TIMEOUT ?? 60,
      IOT_QUEUE_BATCH_SIZE: config.IOT_QUEUE_BATCH_SIZE ?? 5,
      IOT_QUEUE_IDLE_DELAY_MS: config.IOT_QUEUE_IDLE_DELAY_MS ?? 1000,
      SERVICE_NAME: config.SERVICE_NAME ?? 'biz-service',
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
  return validated;
}
