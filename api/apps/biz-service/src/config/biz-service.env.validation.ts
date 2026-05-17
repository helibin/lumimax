import { plainToInstance, Transform } from 'class-transformer';
import {
  IOT_BRIDGE_DEFAULT_PREFETCH,
  RABBITMQ_DEFAULT_DLX_QUEUE,
  RABBITMQ_DEFAULT_QUEUE,
} from '@lumimax/config';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
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
  BASE_SERVICE_GRPC_ENDPOINT = '127.0.0.1:4120';

  @IsOptional()
  @IsString()
  IOT_SERVICE_GRPC_ENDPOINT = '127.0.0.1:4140';

  /** 与 iot-service 一致，影响 ingest 元数据；证书签发在 iot-service */
  @IsOptional()
  @IsString()
  @IsIn(['aws', 'emqx'])
  IOT_VENDOR = 'emqx';

  /** mq=消费 biz 队列；callback=不经 bridge（需 iot-service 或 gateway 入站） */
  @IsOptional()
  @IsString()
  @IsIn(['mq', 'callback'])
  IOT_RECEIVE_MODE = 'mq';

  @IsOptional()
  @IsString()
  RABBITMQ_QUEUE = RABBITMQ_DEFAULT_QUEUE;

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
  LLM_VISION_PROVIDER = 'openai';

  @IsOptional()
  @IsString()
  LLM_VISION_TIMEOUT_MS = '15000';

  @Transform(({ value }) => Number(value ?? 2))
  @IsInt()
  @Min(1)
  THIRD_PARTY_HTTP_MAX_ATTEMPTS = 2;

  @Transform(({ value }) => Number(value ?? 300))
  @IsInt()
  @Min(0)
  THIRD_PARTY_HTTP_RETRY_DELAY_MS = 300;

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
  PROVIDER_ROUTE_CONFIG_PATH = '';

  @IsOptional()
  @IsString()
  @IsIn(['true', 'false'])
  BOOHEE_ENABLED = 'true';

  @IsOptional()
  @IsString()
  BOOHEE_BASE_URL = '';

  @IsOptional()
  @IsString()
  BOOHEE_APP_ID = '';

  @IsOptional()
  @IsString()
  BOOHEE_APP_KEY = '';

  @IsOptional()
  @IsString()
  BOOHEE_SEARCH_PATH = '/api/v1/foods/search';

  @IsOptional()
  @IsString()
  BOOHEE_DETAIL_PATH = '/api/v1/foods/{id}';

  @Transform(({ value }) => Number(value ?? 8000))
  @IsInt()
  @Min(1000)
  BOOHEE_TIMEOUT_MS = 8000;

  @IsOptional()
  @IsString()
  @IsIn(['true', 'false'])
  USDA_ENABLED = 'true';

  @Transform(({ value }) => Number(value ?? 5))
  @IsInt()
  @Min(1)
  FOOD_QUERY_MAX_CANDIDATES = 5;

  @Transform(({ value }) => Number(value ?? 0.9))
  @Min(0.5)
  @Max(0.99)
  FOOD_QUERY_PROVIDER_STRONG_CONFIDENCE = 0.99;

  @IsOptional()
  @IsString()
  @IsIn(['true', 'false'])
  FOOD_QUERY_ENABLE_LLM_FALLBACK = 'false';

  @IsOptional()
  @IsString()
  @IsIn(['true', 'false'])
  FOOD_QUERY_ENABLE_NUTRITION_LABEL_OCR = 'true';

  @IsOptional()
  @IsString()
  @IsIn(['true', 'false'])
  FOOD_QUERY_DEBUG_ENABLED = 'false';

  @IsOptional()
  @IsString()
  @IsIn(['true', 'false'])
  SPEECH_RECOGNITION_ENABLED = 'true';

  @IsOptional()
  @IsString()
  SPEECH_ROUTE_CONFIG_PATH = '';

  @IsOptional()
  @IsString()
  SPEECH_OPENAI_AK = '';

  @IsOptional()
  @IsString()
  SPEECH_OPENAI_MODEL = 'gpt-4o-mini-transcribe';

  @IsOptional()
  @IsString()
  SPEECH_OPENAI_BASE_URL = '';

  @Transform(({ value }) => Number(value ?? 30000))
  @IsInt()
  @Min(5000)
  SPEECH_OPENAI_TIMEOUT_MS = 30000;

  @IsOptional()
  @IsString()
  TENCENT_SPEECH_SECRET_ID = '';

  @IsOptional()
  @IsString()
  TENCENT_SPEECH_SECRET_KEY = '';

  @IsOptional()
  @IsString()
  TENCENT_SPEECH_REGION = 'ap-guangzhou';

  @IsOptional()
  @IsString()
  TENCENT_SPEECH_ENGINE = '';

  @Transform(({ value }) => Number(value ?? 15000))
  @IsInt()
  @Min(3000)
  TENCENT_SPEECH_TIMEOUT_MS = 15000;

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
      SERVICE_NAME: config.SERVICE_NAME ?? 'biz-service',
      IOT_VENDOR: config.IOT_VENDOR ?? 'emqx',
      IOT_SERVICE_GRPC_ENDPOINT:
        config.IOT_SERVICE_GRPC_ENDPOINT ?? '127.0.0.1:4140',
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
