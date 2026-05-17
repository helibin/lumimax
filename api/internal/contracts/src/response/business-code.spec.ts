import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { BusinessCode, mapExceptionToBusinessError } from './business-code';

test('maps missing token to user.noauth', () => {
  const mapped = mapExceptionToBusinessError(
    new UnauthorizedException('Missing bearer token'),
  );
  assert.equal(mapped.code, BusinessCode.USER_NOAUTH);
  assert.equal(mapped.key, 'user.noauth');
});

test('maps invalid token to user.token_invalid', () => {
  const mapped = mapExceptionToBusinessError(
    new UnauthorizedException('Invalid bearer token'),
  );
  assert.equal(mapped.code, BusinessCode.USER_TOKEN_INVALID);
  assert.equal(mapped.key, 'user.token_invalid');
});

test('maps invalid credentials to auth.invalid_credentials', () => {
  const mapped = mapExceptionToBusinessError(
    new UnauthorizedException('Invalid username or password'),
  );
  assert.equal(mapped.code, BusinessCode.AUTH_INVALID_CREDENTIALS);
  assert.equal(mapped.key, 'auth.invalid_credentials');
});

test('maps invalid admin credentials to auth.invalid_credentials', () => {
  const mapped = mapExceptionToBusinessError(
    new UnauthorizedException('invalid admin credentials'),
  );
  assert.equal(mapped.code, BusinessCode.AUTH_INVALID_CREDENTIALS);
  assert.equal(mapped.key, 'auth.invalid_credentials');
});

test('maps nested invalid admin credentials details to auth.invalid_credentials', () => {
  const mapped = mapExceptionToBusinessError(
    new UnauthorizedException({
      message: 'Unauthorized',
      details: {
        message: 'invalid admin credentials',
        statusCode: 401,
      },
    }),
  );
  assert.equal(mapped.code, BusinessCode.AUTH_INVALID_CREDENTIALS);
  assert.equal(mapped.key, 'auth.invalid_credentials');
});

test('maps validation exception to request.validation_failed', () => {
  const mapped = mapExceptionToBusinessError(
    new BadRequestException({
      message: 'Validation failed',
      errors: ['username should not be empty'],
    }),
  );
  assert.equal(mapped.code, BusinessCode.REQUEST_VALIDATION_FAILED);
  assert.equal(mapped.key, 'request.validation_failed');
});

test('maps conflict exception to resource.conflict', () => {
  const mapped = mapExceptionToBusinessError(
    new ConflictException('Username already exists'),
  );
  assert.equal(mapped.code, BusinessCode.RESOURCE_CONFLICT);
  assert.equal(mapped.key, 'resource.conflict');
});

test('maps EMQX mq-mode HTTP ingest conflict to dedicated business code', () => {
  const mapped = mapExceptionToBusinessError(
    new ConflictException({
      message: 'no',
      businessCode: BusinessCode.IOT_EMQX_QUEUE_MODE_HTTP_INGEST_DISABLED,
      code: BusinessCode.IOT_EMQX_QUEUE_MODE_HTTP_INGEST_DISABLED,
      key: 'iot.emqx_queue_mode_http_ingest_disabled',
      statusCode: 409,
    }),
  );
  assert.equal(mapped.code, BusinessCode.IOT_EMQX_QUEUE_MODE_HTTP_INGEST_DISABLED);
  assert.equal(mapped.key, 'iot.emqx_queue_mode_http_ingest_disabled');
});

test('maps user not registered to user.not_registered', () => {
  const mapped = mapExceptionToBusinessError(
    new NotFoundException('User not registered'),
  );
  assert.equal(mapped.code, BusinessCode.USER_NOT_REGISTERED);
  assert.equal(mapped.key, 'user.not_registered');
});

test('maps disabled user to user.disabled', () => {
  const mapped = mapExceptionToBusinessError(
    new ForbiddenException('User account is disabled'),
  );
  assert.equal(mapped.code, BusinessCode.USER_DISABLED);
  assert.equal(mapped.key, 'user.disabled');
});
