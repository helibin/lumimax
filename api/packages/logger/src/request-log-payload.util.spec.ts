import assert from 'node:assert/strict';
import test from 'node:test';
import { extractRequestPayloadForLog } from './request-log-payload.util';

test('extractRequestPayloadForLog includes params/query/body', () => {
  const payload = extractRequestPayloadForLog({
    params: { id: '01h0000000000000000000001' },
    query: { page: '1' },
    body: { username: 'demo' },
  });

  assert.deepEqual(payload, {
    params: { id: '01h0000000000000000000001' },
    query: { page: '1' },
    body: { username: 'demo' },
  });
});

test('extractRequestPayloadForLog redacts sensitive fields', () => {
  const payload = extractRequestPayloadForLog({
    body: {
      username: 'demo',
      password: 'secret',
      accessToken: 'token-value',
      nested: {
        refresh_token: 'rt_xxx',
      },
    },
    query: {
      authorization: 'Bearer abc',
    },
  }) as {
    body?: Record<string, unknown>;
    query?: Record<string, unknown>;
  };

  assert.equal(payload.body?.password, '[REDACTED]');
  assert.equal(payload.body?.accessToken, '[REDACTED]');
  assert.deepEqual(payload.body?.nested, { refresh_token: '[REDACTED]' });
  assert.equal(payload.query?.authorization, '[REDACTED]');
});

test('extractRequestPayloadForLog truncates very long string', () => {
  const longText = 'a'.repeat(800);
  const payload = extractRequestPayloadForLog({
    body: { text: longText },
  }) as { body?: Record<string, unknown> };

  const text = String(payload.body?.text ?? '');
  assert.equal(text.startsWith('a'.repeat(500)), true);
  assert.equal(text.includes('(truncated 300 chars)'), true);
});
