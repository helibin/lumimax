import { plainToInstance, Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  validateSync,
} from 'class-validator';

class BaseServiceEnvSchema {
  @IsString()
  @IsNotEmpty()
  NODE_ENV!: string;

  @IsString()
  SERVICE_NAME = 'base-service';

  @IsOptional()
  @IsString()
  HOST = '0.0.0.0';

  @Transform(({ value }) => Number(value ?? 4020))
  @IsInt()
  @Min(1)
  HTTP_PORT = 4020;

  @Transform(({ value }) => Number(value ?? 4120))
  @IsInt()
  @Min(1)
  GRPC_PORT = 4120;

}

export function validateBaseServiceEnv(
  config: Record<string, unknown>,
): BaseServiceEnvSchema {
  const validated = plainToInstance(
    BaseServiceEnvSchema,
    {
      ...config,
      SERVICE_NAME: config.SERVICE_NAME ?? 'base-service',
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
