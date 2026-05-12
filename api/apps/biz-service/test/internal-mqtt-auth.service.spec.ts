import assert from 'node:assert/strict';
import test from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { InternalMqttAuthService } from '../src/iot/bridge/internal-mqtt-auth.service';

test('internal mqtt auth accepts bearer token that matches shared secret', () => {
  const previous = process.env.IOT_INTERNAL_SHARED_SECRET;
  process.env.IOT_INTERNAL_SHARED_SECRET = 'test-shared-secret';
  try {
    const service = new InternalMqttAuthService();
    assert.doesNotThrow(() =>
      service.authorize({
        authorization: 'Bearer test-shared-secret',
      }),
    );
  } finally {
    if (previous === undefined) {
      delete process.env.IOT_INTERNAL_SHARED_SECRET;
    } else {
      process.env.IOT_INTERNAL_SHARED_SECRET = previous;
    }
  }
});

test('internal mqtt auth accepts x-internal-token header that matches shared secret', () => {
  const previous = process.env.IOT_INTERNAL_SHARED_SECRET;
  process.env.IOT_INTERNAL_SHARED_SECRET = 'test-shared-secret';
  try {
    const service = new InternalMqttAuthService();
    assert.doesNotThrow(() =>
      service.authorize({
        'x-internal-token': 'test-shared-secret',
      }),
    );
  } finally {
    if (previous === undefined) {
      delete process.env.IOT_INTERNAL_SHARED_SECRET;
    } else {
      process.env.IOT_INTERNAL_SHARED_SECRET = previous;
    }
  }
});

test('internal mqtt auth rejects requests when shared secret is missing', () => {
  const previous = process.env.IOT_INTERNAL_SHARED_SECRET;
  delete process.env.IOT_INTERNAL_SHARED_SECRET;
  try {
    const service = new InternalMqttAuthService();
    assert.throws(
      () => service.authorize({ authorization: 'Bearer anything' }),
      (error: unknown) =>
        error instanceof UnauthorizedException
        && error.message === 'internal mqtt shared secret is not configured',
    );
  } finally {
    if (previous === undefined) {
      delete process.env.IOT_INTERNAL_SHARED_SECRET;
    } else {
      process.env.IOT_INTERNAL_SHARED_SECRET = previous;
    }
  }
});

test('internal mqtt auth rejects requests with wrong shared secret', () => {
  const previous = process.env.IOT_INTERNAL_SHARED_SECRET;
  process.env.IOT_INTERNAL_SHARED_SECRET = 'test-shared-secret';
  try {
    const service = new InternalMqttAuthService();
    assert.throws(
      () => service.authorize({ authorization: 'Bearer wrong-secret' }),
      (error: unknown) =>
        error instanceof UnauthorizedException
        && error.message === 'invalid internal mqtt credentials',
    );
  } finally {
    if (previous === undefined) {
      delete process.env.IOT_INTERNAL_SHARED_SECRET;
    } else {
      process.env.IOT_INTERNAL_SHARED_SECRET = previous;
    }
  }
});
