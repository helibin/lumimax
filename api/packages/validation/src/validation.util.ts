import {
  BadRequestException,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import {
  plainToInstance,
  type ClassConstructor,
  type ClassTransformOptions,
} from 'class-transformer';
import { validate, type ValidatorOptions } from 'class-validator';

export interface ValidateDtoOptions {
  validator?: ValidatorOptions;
  transformer?: ClassTransformOptions;
  message?: string;
}

const DEFAULT_VALIDATOR_OPTIONS: ValidatorOptions = {
  whitelist: false,
  forbidNonWhitelisted: false,
  validationError: {
    target: false,
    value: false,
  },
};

export function formatValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): string[] {
  return errors.flatMap((error) => {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;
    const current = error.constraints
      ? Object.values(error.constraints).map((message) => `${path}: ${message}`)
      : [];
    const children = error.children?.length
      ? formatValidationErrors(error.children, path)
      : [];
    return [...current, ...children];
  });
}

export function createGlobalValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
    ...DEFAULT_VALIDATOR_OPTIONS,
    exceptionFactory: (errors: ValidationError[]) =>
      new BadRequestException({
        message: 'Validation failed',
        errors: formatValidationErrors(errors),
      }),
  });
}

export async function validateDto<T extends object>(
  dtoClass: ClassConstructor<T>,
  payload: unknown,
  options: ValidateDtoOptions = {},
): Promise<T> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new BadRequestException({
      message: options.message ?? 'Validation failed',
      errors: ['payload: must be an object'],
    });
  }

  const transformed = plainToInstance(
    dtoClass,
    payload as Record<string, unknown>,
    {
      enableImplicitConversion: true,
      ...(options.transformer ?? {}),
    },
  );

  const errors = await validate(transformed, {
    ...DEFAULT_VALIDATOR_OPTIONS,
    ...(options.validator ?? {}),
  });

  if (errors.length > 0) {
    throw new BadRequestException({
      message: options.message ?? 'Validation failed',
      errors: formatValidationErrors(errors),
    });
  }

  return transformed;
}
