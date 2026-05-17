import assert from 'node:assert/strict';
import test from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { InternalMqttAuthService } from '../src/ingress/internal-mqtt-auth.service';

test('internal mqtt auth accepts bearer token that matches shared secret', () => {
  const previous = process.env.EMQX_AUTH_SECRET;
  process.env.EMQX_AUTH_SECRET = 'test-shared-secret';
  try {
    const service = new InternalMqttAuthService();
    assert.doesNotThrow(() =>
      service.authorize({
        authorization: 'Bearer test-shared-secret',
      }),
    );
  } finally {
    if (previous === undefined) {
      delete process.env.EMQX_AUTH_SECRET;
    } else {
      process.env.EMQX_AUTH_SECRET = previous;
    }
  }
});

test('internal mqtt auth accepts x-internal-token header that matches shared secret', () => {
  const previous = process.env.EMQX_AUTH_SECRET;
  process.env.EMQX_AUTH_SECRET = 'test-shared-secret';
  try {
    const service = new InternalMqttAuthService();
    assert.doesNotThrow(() =>
      service.authorize({
        'x-internal-token': 'test-shared-secret',
      }),
    );
  } finally {
    if (previous === undefined) {
      delete process.env.EMQX_AUTH_SECRET;
    } else {
      process.env.EMQX_AUTH_SECRET = previous;
    }
  }
});

test('internal mqtt auth rejects requests when shared secret is missing', () => {
  const previous = process.env.EMQX_AUTH_SECRET;
  delete process.env.EMQX_AUTH_SECRET;
  try {
    const service = new InternalMqttAuthService();
    assert.throws(
      () => service.authorize({ authorization: 'Bearer anything' }),
      (error: unknown) =>
        error instanceof UnauthorizedException
        && error.message === 'emqx auth secret is not configured',
    );
  } finally {
    if (previous === undefined) {
      delete process.env.EMQX_AUTH_SECRET;
    } else {
      process.env.EMQX_AUTH_SECRET = previous;
    }
  }
});

test('internal mqtt auth rejects requests with wrong shared secret', () => {
  const previous = process.env.EMQX_AUTH_SECRET;
  process.env.EMQX_AUTH_SECRET = 'test-shared-secret';
  try {
    const service = new InternalMqttAuthService();
    assert.throws(
      () => service.authorize({ authorization: 'Bearer wrong-secret' }),
      (error: unknown) =>
        error instanceof UnauthorizedException
        && error.message === 'invalid emqx auth credentials',
    );
  } finally {
    if (previous === undefined) {
      delete process.env.EMQX_AUTH_SECRET;
    } else {
      process.env.EMQX_AUTH_SECRET = previous;
    }
  }
});
